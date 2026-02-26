"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { copy } from "./copy_ko";
import { Anchors, DesignSpec, LlmAssistForm, LlmExtractionM, PrimaryResult, Profile, TripForm } from "./types";
import { chapterLabel, finalizePrimary, initScore, questions } from "./primaryModel";
import { loadLocal, resetLocal, saveLocal } from "./storage";

type Step = "hero" | "primary_profile" | "primary_q" | "trip" | "anchors" | "assist" | "loading" | "summary" | "done";

type State = {
  step: Step;
  progress: number; // 0..100
  profile: Profile;
  qIdx: number;
  answers: number[];
  score: ReturnType<typeof initScore>;
  primary?: PrimaryResult;

  trip: TripForm;
  anchors: Anchors;
  assist: LlmAssistForm;

  extraction?: LlmExtractionM;
  confirmed?: boolean;
};

function defaultTrip(): TripForm {
  return {
    city: "",
    nights: "",
    days: "",
    companion: "",
    withChild: "",
    childAge: "",
    goal: "",
    avoid: "",
    activityTolerance: "",
    maxWait: "",
    density: "",
    transportMulti: { walk:false, transit:false, taxi:false, rent:false },
    transportMain: "",
    mobilityLimits: { stroller:false, walkingIssue:false, heavyLuggage:false, none:true },
    stayStyle: "",
    stayPriority: [],
  };
}

function defaultAnchors(): Anchors {
  return { must: [], should: [], avoid: [] };
}

function defaultAssist(): LlmAssistForm {
  return {
    mood: [],
    specialMeaning: "",
    successMoments: "",
    worries: [],
    worriesEtc: "",
    conflictRule: "",
    hardNo: [],
  };
}

type Action =
  | { type:"GO"; step: Step }
  | { type:"SET_PROGRESS"; progress:number }
  | { type:"SET_PROFILE"; profile: Profile }
  | { type:"ANSWER"; v:number }
  | { type:"BACK_Q" }
  | { type:"SET_TRIP"; patch: Partial<TripForm> }
  | { type:"SET_ANCHORS"; anchors: Anchors }
  | { type:"SET_ASSIST"; patch: Partial<LlmAssistForm> }
  | { type:"SET_EXTRACTION"; extraction: LlmExtractionM }
  | { type:"CONFIRM"; confirmed:boolean }
  | { type:"RESET" };

function reducer(state: State, action: Action): State {
  switch(action.type){
    case "GO":
      return { ...state, step: action.step };
    case "SET_PROGRESS":
      return { ...state, progress: Math.max(0, Math.min(100, action.progress)) };
    case "SET_PROFILE":
      return { ...state, profile: action.profile };
    case "ANSWER": {
      const v = action.v;
      const idx = state.qIdx;
      const nextAnswers = [...state.answers];
      nextAnswers[idx] = v;

      const nextScore = { ...state.score };
      questions[idx].apply(v, nextScore);

      const nextIdx = idx + 1;

      // progress: primary 질문 기반
      const pct = Math.round((nextIdx / questions.length) * 35); // 0~35%를 1차에 할당
      if(nextIdx < questions.length){
        return { ...state, answers: nextAnswers, score: nextScore, qIdx: nextIdx, progress: pct };
      }
      const primary = finalizePrimary(state.profile, nextAnswers, nextScore);
      return { ...state, answers: nextAnswers, score: nextScore, qIdx: nextIdx, primary, step:"trip", progress: 35 };
    }
    case "BACK_Q": {
      const prevIdx = Math.max(0, state.qIdx - 1);
      return { ...state, qIdx: prevIdx };
    }
    case "SET_TRIP":
      return { ...state, trip: { ...state.trip, ...action.patch } };
    case "SET_ANCHORS":
      return { ...state, anchors: action.anchors };
    case "SET_ASSIST":
      return { ...state, assist: { ...state.assist, ...action.patch } };
    case "SET_EXTRACTION":
      return { ...state, extraction: action.extraction };
    case "CONFIRM":
      return { ...state, confirmed: action.confirmed, step: "done", progress: 100 };
    case "RESET":
      return initState();
    default:
      return state;
  }
}

function initState(): State {
  return {
    step: "hero",
    progress: 0,
    profile: { nickname:"", gender:"" },
    qIdx: 0,
    answers: [],
    score: initScore(),
    trip: defaultTrip(),
    anchors: defaultAnchors(),
    assist: defaultAssist(),
  };
}

function clampList(items: string[], max: number) {
  const cleaned = items.map(s => s.trim()).filter(Boolean);
  return cleaned.slice(0, max);
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|,/g)
    .map(s => s.trim())
    .filter(Boolean);
}

export default function SurveyFlow() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  // local restore
  useEffect(()=>{
    const prev = loadLocal();
    if(!prev) return;
    // 최소 복구: 프로필/트립/앵커/보조
    if(prev.primary?.profile){
      dispatch({ type:"SET_PROFILE", profile: prev.primary.profile });
    }
  },[]);

  // persist minimal
  useEffect(()=>{
    saveLocal({
      primary: state.primary,
      trip: state.trip,
      anchors: state.anchors,
      assist: state.assist,
      extraction: state.extraction,
    } as any);
  },[state.primary, state.trip, state.anchors, state.assist, state.extraction]);

  const headerSub = useMemo(()=>{
    switch(state.step){
      case "hero": return copy.headerSub;
      case "primary_profile":
      case "primary_q": return "1차 설문: 성향을 정밀하게 측정합니다.";
      case "trip": return "2차 설문: 이번 여행 조건을 설정합니다.";
      case "anchors": return "앵커: 꼭 넣고 싶은 것을 고정합니다.";
      case "assist": return "보조 질문: 맥락을 보정합니다.";
      case "loading": return "요약 생성 중";
      case "summary": return "설계 전략 요약";
      case "done": return "완료";
      default: return copy.headerSub;
    }
  },[state.step]);

  const barWidth = `${state.progress}%`;

  // ===== handlers
  async function runExtraction(){
    if(!state.primary) return;

    dispatch({ type:"GO", step:"loading" });
    dispatch({ type:"SET_PROGRESS", progress: 88 });

    const payload = {
      primary: state.primary,
      trip: state.trip,
      anchors: state.anchors,
      assist: state.assist,
    };

    const res = await fetch("/api/llm-extract", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });

    if(!res.ok){
      // fallback: mock
      const mock: LlmExtractionM = {
        context_tags: [],
        success_moments: [],
        risks: [],
        hard_constraints: { max_wait_minutes: state.trip.maxWait === "상관없음" ? 60 : Number(state.trip.maxWait || 20) },
        soft_preferences: { mood: state.assist.mood, pace: state.trip.density === "여유" ? "light" : state.trip.density === "빡빡" ? "dense" : "moderate" },
        user_summary_sentence: "요약 생성 실패. 키/네트워크를 확인하세요.",
      };
      dispatch({ type:"SET_EXTRACTION", extraction: mock });
      dispatch({ type:"GO", step:"summary" });
      dispatch({ type:"SET_PROGRESS", progress: 95 });
      return;
    }

    const data = (await res.json()) as { extraction: LlmExtractionM };
    dispatch({ type:"SET_EXTRACTION", extraction: data.extraction });
    dispatch({ type:"GO", step:"summary" });
    dispatch({ type:"SET_PROGRESS", progress: 95 });
  }

  // ===== screens
  return (
    <>
      <div className="header">
        <div className="brand">
          <div className="dot" />
          <div>{copy.headerTitle}</div>
        </div>
        <div className="sub">{headerSub}</div>

        <div className="progress" aria-label="progress">
          <div className="bar" style={{ width: barWidth }} />
        </div>
      </div>

      <div className="main">
        {/* HERO */}
        <section className={`screen ${state.step === "hero" ? "active" : ""}`}>
          <div className="title">{copy.heroTitle}</div>
          <p className="desc">{copy.heroDesc}</p>
          <button className="btn primary" onClick={()=>{
            dispatch({ type:"GO", step:"primary_profile" });
            dispatch({ type:"SET_PROGRESS", progress: 0 });
          }}>
            {copy.startBtn}
          </button>
          <p className="smallNote">
            모바일 우선. 흐름은 한 번에 끝납니다.
          </p>
        </section>

        {/* PRIMARY - PROFILE */}
        <section className={`screen ${state.step === "primary_profile" ? "active" : ""}`}>
          <div className="title">{copy.primaryTitle}</div>
          <p className="desc">{copy.primaryDesc}</p>

          <div className="form">
            <div className="field">
              <label>닉네임</label>
              <input
                value={state.profile.nickname}
                placeholder="예: 현승"
                onChange={(e)=>dispatch({ type:"SET_PROFILE", profile: { ...state.profile, nickname: e.target.value } })}
              />
            </div>
            <div className="field">
              <label>성별</label>
              <select
                value={state.profile.gender}
                onChange={(e)=>dispatch({ type:"SET_PROFILE", profile: { ...state.profile, gender: e.target.value as any } })}
              >
                <option value="">선택</option>
                <option value="남성">남성</option>
                <option value="여성">여성</option>
              </select>
            </div>
          </div>

          <button
            className="btn primary"
            disabled={!state.profile.nickname.trim() || !state.profile.gender}
            onClick={()=>{
              dispatch({ type:"GO", step:"primary_q" });
              dispatch({ type:"SET_PROGRESS", progress: 1 });
            }}
          >
            {copy.next}
          </button>

          <div className="hr" />
          <button className="btn" onClick={()=>{
            resetLocal();
            dispatch({ type:"RESET" });
          }}>
            초기화 <span>↺</span>
          </button>
        </section>

        {/* PRIMARY - QUESTIONS */}
        <section className={`screen ${state.step === "primary_q" ? "active" : ""}`}>
          <div className="kv">
            <div className="kvRow">
              <div className="kvKey">진행</div>
              <div className="kvVal">Q {Math.min(state.qIdx+1, questions.length)} / {questions.length}</div>
            </div>
            <div className="kvRow">
              <div className="kvKey">챕터</div>
              <div className="kvVal">{chapterLabel[questions[Math.min(state.qIdx, questions.length-1)]?.domain] ?? ""}</div>
            </div>
          </div>

          <div className="hr" />

          {state.qIdx < questions.length ? (
            <>
              <div className="title" style={{ fontSize: 18 }}>
                {questions[state.qIdx].text}
              </div>
              <p className="desc">1은 “전혀 아니다”, 7은 “매우 그렇다”</p>

              <div className="pills" aria-label="scale">
                {Array.from({length:7}).map((_,i)=>{
                  const v = i+1;
                  return (
                    <button
                      key={v}
                      className={`pill ${state.answers[state.qIdx] === v ? "selected" : ""}`}
                      onClick={()=>dispatch({ type:"ANSWER", v })}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>

              <div className="hr" />

              <div className="row">
                <button
                  className="btn"
                  disabled={state.qIdx === 0}
                  onClick={()=>dispatch({ type:"BACK_Q" })}
                >
                  {copy.back} <span>←</span>
                </button>
                <button
                  className="btn primary"
                  disabled={state.answers[state.qIdx] == null}
                  onClick={()=>dispatch({ type:"ANSWER", v: state.answers[state.qIdx] ?? 4 })}
                >
                  선택 완료 <span>→</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="title">1차 설문 완료</div>
              <p className="desc">다음 단계에서 이번 여행 조건을 입력합니다.</p>
              <button className="btn primary" onClick={()=>dispatch({ type:"GO", step:"trip" })}>
                {copy.next}
              </button>
            </>
          )}
        </section>

        {/* TRIP */}
        <section className={`screen ${state.step === "trip" ? "active" : ""}`}>
          <div className="title">{copy.tripTitle}</div>
          <p className="desc">{copy.tripDesc}</p>

          <div className="form">
            <div className="field">
              <label>여행지(도시)</label>
              <input value={state.trip.city} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ city:e.target.value }})} placeholder="예: 오사카" />
            </div>

            <div className="row">
              <div className="field" style={{ flex:1 }}>
                <label>박</label>
                <input value={state.trip.nights} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ nights:e.target.value }})} placeholder="예: 2" inputMode="numeric" />
              </div>
              <div className="field" style={{ flex:1 }}>
                <label>일</label>
                <input value={state.trip.days} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ days:e.target.value }})} placeholder="예: 3" inputMode="numeric" />
              </div>
            </div>

            <div className="field">
              <label>동행 유형</label>
              <select value={state.trip.companion} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ companion:e.target.value as any }})}>
                <option value="">선택</option>
                <option value="솔로">솔로</option>
                <option value="친구">친구</option>
                <option value="연인">연인</option>
                <option value="가족">가족</option>
              </select>
            </div>

            {state.trip.companion === "가족" && (
              <div className="row">
                <div className="field" style={{ flex:1 }}>
                  <label>아이 동반</label>
                  <select value={state.trip.withChild} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ withChild:e.target.value as any }})}>
                    <option value="">선택</option>
                    <option value="예">예</option>
                    <option value="아니오">아니오</option>
                  </select>
                </div>
                {state.trip.withChild === "예" && (
                  <div className="field" style={{ flex:1 }}>
                    <label>아이 나이대</label>
                    <select value={state.trip.childAge} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ childAge:e.target.value as any }})}>
                      <option value="">선택</option>
                      <option value="미취학">미취학</option>
                      <option value="초등">초등</option>
                      <option value="중등+">중등+</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <label>이번 여행 1순위 목표 (1개)</label>
              <select value={state.trip.goal} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ goal:e.target.value }})}>
                <option value="">선택</option>
                <option value="휴식/회복">휴식/회복</option>
                <option value="음식">음식</option>
                <option value="분위기/감성">분위기/감성</option>
                <option value="관광/명소">관광/명소</option>
                <option value="쇼핑">쇼핑</option>
                <option value="액티비티">액티비티</option>
                <option value="로컬 탐험">로컬 탐험</option>
              </select>
            </div>

            <div className="field">
              <label>가장 피하고 싶은 것 (1개)</label>
              <select value={state.trip.avoid} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ avoid:e.target.value }})}>
                <option value="">선택</option>
                <option value="체력 과부하">체력 과부하</option>
                <option value="웨이팅/동선 스트레스">웨이팅/동선 스트레스</option>
                <option value="동행 갈등">동행 갈등</option>
                <option value="비용 스트레스">비용 스트레스</option>
                <option value="기대 대비 실망">기대 대비 실망</option>
              </select>
            </div>

            <div className="field">
              <label>하루 활동 강도 허용치</label>
              <select value={state.trip.activityTolerance} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ activityTolerance:e.target.value as any }})}>
                <option value="">선택</option>
                <option value="가볍게">가볍게(1~2개 + 휴식)</option>
                <option value="보통">보통(2~3개 + 이동)</option>
                <option value="적극적">적극적(3~4개 + 이동 많음)</option>
                <option value="강행군">강행군도 가능</option>
              </select>
            </div>

            <div className="row">
              <div className="field" style={{ flex:1 }}>
                <label>웨이팅 허용</label>
                <select value={state.trip.maxWait} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ maxWait:e.target.value as any }})}>
                  <option value="">선택</option>
                  <option value="10">10분 이하</option>
                  <option value="20">20분</option>
                  <option value="40">40분</option>
                  <option value="60">60분</option>
                  <option value="상관없음">상관없음</option>
                </select>
              </div>
              <div className="field" style={{ flex:1 }}>
                <label>일정 밀도</label>
                <select value={state.trip.density} onChange={(e)=>dispatch({ type:"SET_TRIP", patch:{ density:e.target.value as any }})}>
                  <option value="">선택</option>
                  <option value="여유">여유(1~2개)</option>
                  <option value="보통">보통(2~3개)</option>
                  <option value="빡빡">빡빡(3~4개+)</option>
                </select>
              </div>
            </div>
          </div>

          <button
            className="btn primary"
            disabled={!state.trip.city.trim() || !state.trip.goal || !state.trip.avoid || !state.trip.activityTolerance || !state.trip.maxWait || !state.trip.density || !state.trip.companion}
            onClick={()=>{
              dispatch({ type:"SET_PROGRESS", progress: 55 });
              dispatch({ type:"GO", step:"anchors" });
            }}
          >
            {copy.next}
          </button>
        </section>

        {/* ANCHORS */}
        <section className={`screen ${state.step === "anchors" ? "active" : ""}`}>
          <div className="title">{copy.anchorTitle}</div>
          <p className="desc">{copy.anchorDesc}</p>

          <div className="form">
            <div className="field">
              <label>반드시 포함 (최대 3개, 줄바꿈/쉼표로 구분)</label>
              <textarea
                defaultValue={state.anchors.must.join("\n")}
                placeholder={"예: USJ\n교토 하루\n도톤보리 야경"}
                onBlur={(e)=>{
                  const must = clampList(splitLines(e.target.value), 3);
                  dispatch({ type:"SET_ANCHORS", anchors: { ...state.anchors, must }});
                }}
              />
            </div>
            <div className="field">
              <label>가능하면 포함 (최대 3개)</label>
              <textarea
                defaultValue={state.anchors.should.join("\n")}
                placeholder={"예: 온천 1회\n카페 2곳\n맛집 1곳"}
                onBlur={(e)=>{
                  const should = clampList(splitLines(e.target.value), 3);
                  dispatch({ type:"SET_ANCHORS", anchors: { ...state.anchors, should }});
                }}
              />
            </div>
            <div className="field">
              <label>제외(선택)</label>
              <textarea
                defaultValue={state.anchors.avoid.join("\n")}
                placeholder={"예: 새벽 기상, 긴 환승, 사람 많은 곳"}
                onBlur={(e)=>{
                  const avoid = clampList(splitLines(e.target.value), 6);
                  dispatch({ type:"SET_ANCHORS", anchors: { ...state.anchors, avoid }});
                }}
              />
            </div>
          </div>

          <button
            className="btn primary"
            disabled={state.anchors.must.length === 0}
            onClick={()=>{
              dispatch({ type:"SET_PROGRESS", progress: 70 });
              dispatch({ type:"GO", step:"assist" });
            }}
          >
            {copy.next}
          </button>

          <p className="smallNote">
            반드시 포함이 0개면 설계 기준이 흔들린다. 최소 1개는 받는다.
          </p>
        </section>

        {/* ASSIST */}
        <section className={`screen ${state.step === "assist" ? "active" : ""}`}>
          <div className="title">{copy.assistTitle}</div>
          <p className="desc">{copy.assistDesc}</p>

          <div className="form">
            <div className="field">
              <label>이번 여행 톤(최대 2개)</label>
              <select
                multiple
                value={state.assist.mood}
                onChange={(e)=>{
                  const selected = Array.from(e.target.selectedOptions).map(o=>o.value).slice(0,2);
                  dispatch({ type:"SET_ASSIST", patch:{ mood:selected }});
                }}
                style={{ minHeight: 120 }}
              >
                <option value="힐링/회복">힐링/회복</option>
                <option value="설렘/로맨틱">설렘/로맨틱</option>
                <option value="맛집/미식">맛집/미식</option>
                <option value="관광/체크리스트">관광/체크리스트</option>
                <option value="쇼핑">쇼핑</option>
                <option value="즉흥/탐험">즉흥/탐험</option>
                <option value="가족 이벤트/효도">가족 이벤트/효도</option>
              </select>
            </div>

            <div className="field">
              <label>이번 여행이 특별한 이유(짧게)</label>
              <input
                value={state.assist.specialMeaning}
                onChange={(e)=>dispatch({ type:"SET_ASSIST", patch:{ specialMeaning:e.target.value }})}
                placeholder="예: 여자친구와 첫 여행"
              />
            </div>

            <div className="field">
              <label>‘성공’이라고 느끼려면 필요한 순간(1~2개)</label>
              <input
                value={state.assist.successMoments}
                onChange={(e)=>dispatch({ type:"SET_ASSIST", patch:{ successMoments:e.target.value }})}
                placeholder="예: 야경 좋은 곳에서 사진, 분위기 좋은 디너"
              />
            </div>

            <div className="field">
              <label>걱정되는 것(복수 선택)</label>
              <select
                multiple
                value={state.assist.worries}
                onChange={(e)=>{
                  const selected = Array.from(e.target.selectedOptions).map(o=>o.value);
                  dispatch({ type:"SET_ASSIST", patch:{ worries:selected }});
                }}
                style={{ minHeight: 160 }}
              >
                <option value="체력">체력</option>
                <option value="웨이팅/동선">웨이팅/동선</option>
                <option value="예산">예산</option>
                <option value="날씨">날씨</option>
                <option value="동행 갈등">동행 갈등</option>
                <option value="아이 컨디션">아이 컨디션</option>
                <option value="음식 리스크">음식 리스크</option>
                <option value="언어/길찾기">언어/길찾기</option>
              </select>
            </div>

            <div className="field">
              <label>기타 걱정(선택)</label>
              <input
                value={state.assist.worriesEtc}
                onChange={(e)=>dispatch({ type:"SET_ASSIST", patch:{ worriesEtc:e.target.value }})}
                placeholder="예: 예전에 비슷한 여행에서 싸운 적 있음"
              />
            </div>

            <div className="field">
              <label>갈등 발생 시 기준(2인 이상이면 중요)</label>
              <select value={state.assist.conflictRule} onChange={(e)=>dispatch({ type:"SET_ASSIST", patch:{ conflictRule:e.target.value as any }})}>
                <option value="">선택</option>
                <option value="최약자 기준">최약자 기준</option>
                <option value="다수결">다수결</option>
                <option value="번갈아">번갈아</option>
                <option value="즉흥 협의">즉흥 협의</option>
              </select>
            </div>

            <div className="field">
              <label>절대 싫은 것(1~2개)</label>
              <select
                multiple
                value={state.assist.hardNo}
                onChange={(e)=>{
                  const selected = Array.from(e.target.selectedOptions).map(o=>o.value).slice(0,2);
                  dispatch({ type:"SET_ASSIST", patch:{ hardNo:selected }});
                }}
                style={{ minHeight: 140 }}
              >
                <option value="새벽 기상">새벽 기상</option>
                <option value="긴 줄">긴 줄</option>
                <option value="환승 많음">환승 많음</option>
                <option value="빡빡 일정">빡빡 일정</option>
                <option value="비싼 소비">비싼 소비</option>
                <option value="즉흥(계획 없음)">즉흥(계획 없음)</option>
                <option value="사람 많은 곳">사람 많은 곳</option>
              </select>
            </div>
          </div>

          <button
            className="btn primary"
            disabled={!state.primary}
            onClick={()=>{
              dispatch({ type:"SET_PROGRESS", progress: 82 });
              runExtraction();
            }}
          >
            {copy.saveAndNext}
          </button>
        </section>

        {/* LOADING */}
        <section className={`screen ${state.step === "loading" ? "active" : ""}`}>
          <div className="title">요약 생성 중</div>
          <p className="desc">설계 전략 요약 카드를 만드는 중입니다.</p>
          <div className="smallNote">
            키가 없으면 mock으로 진행됩니다. (나중에 OPENAI_API_KEY 넣으면 실호출)
          </div>
        </section>

        {/* SUMMARY */}
        <section className={`screen ${state.step === "summary" ? "active" : ""}`}>
          <div className="title">{copy.summaryTitle}</div>
          <p className="desc">{copy.summaryDesc}</p>

          {state.primary && state.extraction ? (
            <>
              <div className="kv">
                <div className="kvRow"><div className="kvKey">목표</div><div className="kvVal">{state.trip.goal || "-"}</div></div>
                <div className="kvRow"><div className="kvKey">회피</div><div className="kvVal">{state.trip.avoid || "-"}</div></div>
                <div className="kvRow"><div className="kvKey">활동/밀도</div><div className="kvVal">{state.trip.activityTolerance} / {state.trip.density}</div></div>
                <div className="kvRow"><div className="kvKey">웨이팅</div><div className="kvVal">{state.trip.maxWait === "상관없음" ? "유연" : `${state.trip.maxWait}분 이내`}</div></div>
                <div className="kvRow"><div className="kvKey">동행</div><div className="kvVal">{state.trip.companion}{state.trip.companion==="가족" && state.trip.withChild==="예" ? ` (아이:${state.trip.childAge})` : ""}</div></div>
                <div className="kvRow"><div className="kvKey">앵커(필수)</div><div className="kvVal">{state.anchors.must.join(", ")}</div></div>
                {state.trip.companion !== "솔로" && state.assist.conflictRule ? (
                  <div className="kvRow"><div className="kvKey">갈등 룰</div><div className="kvVal">{state.assist.conflictRule}</div></div>
                ) : null}
              </div>

              <div className="hr" />

              <details>
                <summary>{copy.detail}</summary>
                <div>
                  <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>1차(성향) 요약</div>
                  <div style={{ marginBottom: 10 }}>
                    타입: <b style={{ color: "var(--text)" }}>{state.primary.travelerType}</b>
                    <br />
                    효율/무드/구조/탐험(0~1):{" "}
                    <span style={{ color:"var(--text)", fontWeight:700 }}>
                      {state.primary.scoreNorm.efficiency?.toFixed(2)} / {state.primary.scoreNorm.mood?.toFixed(2)} / {state.primary.scoreNorm.structure?.toFixed(2)} / {state.primary.scoreNorm.exploration?.toFixed(2)}
                    </span>
                  </div>

                  <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>LLM 맥락 요약</div>
                  <div style={{ marginBottom: 10 }}>
                    {state.extraction.user_summary_sentence || "-"}
                  </div>

                  <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>리스크/성공</div>
                  <div>
                    리스크: {state.extraction.risks?.length ? state.extraction.risks.join(", ") : "-"}<br/>
                    성공 조건: {state.extraction.success_moments?.length ? state.extraction.success_moments.join(", ") : "-"}
                  </div>

                  <div className="hr" />

                  <div style={{ fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>적용 규칙(요약)</div>
                  <div>
                    - 앵커(must)는 일정에 고정 블록으로 반영<br/>
                    - 웨이팅 허용치를 초과하는 선택은 페널티 또는 제외<br/>
                    - “절대 싫은 것”은 하드 제약으로 취급<br/>
                    - 동행/갈등 룰은 허용치를 보수적으로 조정하는데 사용
                  </div>
                </div>
              </details>

              <div className="hr" />

              <div className="row">
                <button className="btn" onClick={()=>dispatch({ type:"GO", step:"trip" })}>
                  {copy.confirmEdit} <span>↩</span>
                </button>
                <button className="btn primary" onClick={()=>dispatch({ type:"CONFIRM", confirmed:true })}>
                  {copy.confirmYes}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="desc">요약 데이터를 만들지 못했습니다.</p>
              <button className="btn" onClick={()=>dispatch({ type:"GO", step:"assist" })}>
                돌아가기 <span>↩</span>
              </button>
            </>
          )}
        </section>

        {/* DONE */}
        <section className={`screen ${state.step === "done" ? "active" : ""}`}>
          <div className="title">완료</div>
          <p className="desc">
            설계 기준이 확정되었습니다. (MVP-0: 일정 생성은 다음 단계에서 연결)
          </p>
          <button className="btn primary" onClick={()=>dispatch({ type:"GO", step:"hero" })}>
            처음으로 <span>↺</span>
          </button>
          <div className="hr" />
          <button className="btn" onClick={()=>{
            resetLocal();
            dispatch({ type:"RESET" });
          }}>
            로컬 데이터 삭제 <span>🗑</span>
          </button>
        </section>
      </div>
    </>
  );
}
