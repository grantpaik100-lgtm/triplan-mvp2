"use client";

import React, { useEffect, useMemo, useState } from "react";
import "./secondary.css";

import { secondaryQuestions, type SecondaryQuestion, type SecondarySection } from "./secondaryQuestions";
import type { SecondaryAnswers } from "./secondarySchema";
import SecondarySummaryView from "./SecondarySummaryView";

import { loadSecondaryDraft, saveSecondaryDraft } from "@/lib/secondaryStorage";
import { MOTION, GLASS, SHADOW, COLORS, SPACE, TYPE, DENSITY, RADIUS, MAXWIDTH, FOCUS_RING } from "@/lib/MOTION_TOKENS";

type Mode = "intro" | "question" | "summary";

type State = {
  mode: Mode;
  idx: number;
  answers: Partial<SecondaryAnswers> & Record<string, any>;

  returnToSummary: boolean;
  editSection?: SecondarySection;
};

const DEFAULT_STATE: State = {
  mode: "intro",
  idx: 0,
  answers: {},
  returnToSummary: false,
};

const SECTION_LABEL: Record<SecondarySection, string> = {
  G: "기본 정보",
  A: "시간대 · 리듬",
  B: "음식 리스크",
  C: "이동 제약",
  D: "숙소 전략",
  E: "동행 조율",
  F: "핵심 장소 · 이유",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toCssVars(densityKey: keyof typeof DENSITY) {
  const d = DENSITY[densityKey];

  // controls 최대 높이: 하드코딩 금지 → SPACE 기반으로 산출(= 64*8=512px)
  const controlsMaxH = SPACE[64] * 8;

  return {
    ["--tp2-ease" as any]: MOTION.easing,
    ["--tp2-dur-fast" as any]: MOTION.duration.fast,
    ["--tp2-dur-base" as any]: MOTION.duration.base,
    ["--tp2-dur-slow" as any]: MOTION.duration.slow,
    ["--tp2-dur-page" as any]: MOTION.duration.page,

    ["--tp2-enter-opacity" as any]: MOTION.enter.to.opacity,
    ["--tp2-enter-scale" as any]: MOTION.enter.to.scale,
    ["--tp2-enter-blur" as any]: MOTION.enter.to.blurPx,

    ["--tp2-glass-bg" as any]: GLASS.background,
    ["--tp2-glass-border" as any]: GLASS.border,
    ["--tp2-glass-blur" as any]: GLASS.backdropBlurPx,

    ["--tp2-shadow-1" as any]: SHADOW.level1,
    ["--tp2-shadow-2" as any]: SHADOW.level2,
    ["--tp2-shadow-3" as any]: SHADOW.level3,

    ["--tp2-sky1" as any]: COLORS.sky1,
    ["--tp2-sky2" as any]: COLORS.sky2,
    ["--tp2-text" as any]: COLORS.text,
    ["--tp2-muted" as any]: COLORS.muted,
    ["--tp2-line" as any]: COLORS.line,

    ["--tp2-focus" as any]: FOCUS_RING.ring,

    ["--tp2-space-8" as any]: SPACE[8],
    ["--tp2-space-10" as any]: SPACE[10],
    ["--tp2-space-12" as any]: SPACE[12],
    ["--tp2-space-14" as any]: SPACE[14],
    ["--tp2-space-16" as any]: SPACE[16],

    ["--tp2-radius-pill" as any]: RADIUS.pill,
    ["--tp2-radius-lg" as any]: RADIUS.lg,
    ["--tp2-radius-xl" as any]: RADIUS.xl,

    ["--tp2-h2-size" as any]: TYPE.h2.size,
    ["--tp2-h2-lh" as any]: TYPE.h2.lineHeight,
    ["--tp2-h2-w" as any]: TYPE.h2.weight,
    ["--tp2-body-size" as any]: TYPE.body.size,
    ["--tp2-body-lh" as any]: TYPE.body.lineHeight,
    ["--tp2-body-w" as any]: TYPE.body.weight,
    ["--tp2-caption-size" as any]: TYPE.caption.size,
    ["--tp2-caption-lh" as any]: TYPE.caption.lineHeight,
    ["--tp2-caption-w" as any]: TYPE.caption.weight,

    ["--tp2-pad-x" as any]: d.cardPadX,
    ["--tp2-pad-y" as any]: d.cardPadY,
    ["--tp2-rowgap" as any]: d.rowGap,
    ["--tp2-btn-h" as any]: d.buttonHeight,
    ["--tp2-chip-h" as any]: d.chipHeight,

    ["--tp2-maxw" as any]: MAXWIDTH.card,
    ["--tp2-controls-maxh" as any]: controlsMaxH,
  } as React.CSSProperties;
}

function getGroupLabels() {
  return { SOLO: "혼자", GROUP: "여럿" } as const;
}

function getRequiredIds(answers: Record<string, any>) {
  const { SOLO, GROUP } = getGroupLabels();
  const groupMode = answers?.e_groupMode ?? SOLO;

  const base = [
    "g_tripNights",
    "g_tripDays",
    "g_groupSize",
    "g_companionType",
    "a_rhythm",
    "a_density",
    "b_waitingPreset",
    "c_walkCap",
    "d_lodgingStrategy",
    "d_lodgingPriority",
    "f_places",
  ];

  if (groupMode === GROUP) base.push("e_conflictRule");
  return new Set(base);
}

function validateQuestion(q: SecondaryQuestion, answers: Record<string, any>): { ok: boolean; msg?: string } {
  const required = getRequiredIds(answers).has(q.id);
  const v = answers[q.id];

  if (!required) return { ok: true };

  if (q.type === "numberPair") {
    const n = Number(answers["g_tripNights"]);
    const d = Number(answers["g_tripDays"]);
    if (!Number.isFinite(n) || !Number.isFinite(d) || n < 0 || d < 1) return { ok: false, msg: "박/일 입력" };
    return { ok: true };
  }

  if (q.type === "numberOne") {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 1) return { ok: false, msg: "인원 입력" };
    return { ok: true };
  }

  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return { ok: false, msg: "필수 항목" };

  if (q.id === "b_waitingPreset" && v === "직접") {
    const m = Number(answers["b_waitingCustomMinutes"]);
    if (!Number.isFinite(m) || m < 1) return { ok: false, msg: "분 입력" };
  }

  if (q.id === "d_lodgingPriority") {
    if (!Array.isArray(v) || v.length !== 5) return { ok: false, msg: "1~5순위 모두 지정" };
  }

  if (q.id === "f_places") {
    if (!Array.isArray(v) || v.length < 1) return { ok: false, msg: "장소 최소 1개" };
    for (const p of v) {
      if (!p?.name?.trim()) return { ok: false, msg: "장소명" };
      if (!p?.reason?.trim()) return { ok: false, msg: "이유" };
      if (!p?.importance) return { ok: false, msg: "중요도" };
    }
  }

  return { ok: true };
}

export default function SecondaryMiniApp() {
  const [state, setState] = useState<State>(DEFAULT_STATE);

  useEffect(() => {
    const draft = loadSecondaryDraft();
    if (draft?.answers) {
      setState((s) => ({
        ...s,
        answers: draft.answers,
        idx: draft.idx ?? 0,
        mode: draft.mode ?? "intro",
        returnToSummary: draft.returnToSummary ?? false,
        editSection: draft.editSection,
      }));
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => saveSecondaryDraft(state), MOTION.duration.base);
    return () => window.clearTimeout(t);
  }, [state]);

  const filteredQuestions = useMemo(() => {
    const a = state.answers as any;
    const { SOLO, GROUP } = getGroupLabels();
    const groupMode = a?.e_groupMode ?? SOLO;

    return secondaryQuestions.filter((qq) => {
      if (qq.id === "e_conflictRule" && groupMode !== GROUP) return false;
      return true;
    });
  }, [state.answers]);

  useEffect(() => {
    const max = Math.max(0, filteredQuestions.length - 1);
    if (state.idx <= max) return;
    setState((s) => ({ ...s, idx: max }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuestions.length]);

  const total = filteredQuestions.length;
  const q = filteredQuestions[clamp(state.idx, 0, Math.max(0, total - 1))]!;
  const cssVars = useMemo(() => toCssVars("dense"), []);

  const setAnswer = (id: string, value: any) => setState((s) => ({ ...s, answers: { ...(s.answers as any), [id]: value } }));
  const goQuestionAt = (idx: number) => setState((s) => ({ ...s, idx: clamp(idx, 0, Math.max(0, total - 1)), mode: "question" }));
  const goPrev = () => goQuestionAt(state.idx - 1);
  const goNext = () => goQuestionAt(state.idx + 1);

  const validation = useMemo(() => validateQuestion(q, state.answers as any), [q, state.answers]);
  const canNext = validation.ok;

  if (state.mode === "intro") {
    return (
      <main className="tp2-screen" style={cssVars}>
        <div className="tp2-wrap">
          <article className="tp2-card" aria-label="secondary-intro">
            <header className="tp2-cardHeader">
              <div className="tp2-meta">설문 2</div>
              <h2 className="tp2-h2">여행 세부 설정 입력</h2>
              <p className="tp2-body tp2-help">실제 일정 생성에 필요한 제약/우선순위를 입력한다. 약 5분.</p>
            </header>

            <div className="tp2-controls">
              <div className="tp2-meta">예: 음식 리스크, 이동 제약, 숙소 우선순위, 핵심 장소(이유 포함)</div>
            </div>

            <footer className="tp2-footer">
              <button type="button" className="tp2-btnPrimary" onClick={() => setState((s) => ({ ...s, mode: "question", idx: 0 }))}>
                시작
              </button>
            </footer>
          </article>
        </div>
      </main>
    );
  }

  if (state.mode === "summary") {
    return (
      <main className="tp2-screen" style={cssVars}>
        <div className="tp2-wrap">
          <SecondarySummaryView
            questions={filteredQuestions}
            answers={state.answers as any}
            onEditSection={(section) => {
              const idx = filteredQuestions.findIndex((x) => x.section === section);
              setState((s) => ({
                ...s,
                mode: "question",
                idx: idx >= 0 ? idx : 0,
                returnToSummary: true,
                editSection: section,
              }));
            }}
            onBack={() => setState((s) => ({ ...s, mode: "question", idx: 0, returnToSummary: false, editSection: undefined }))}
            onReview={() => {
              window.location.href = "/secondary/review";
            }}
          />
        </div>
      </main>
    );
  }

  const sectionLabel = SECTION_LABEL[q.section];

  return (
    <main className="tp2-screen" style={cssVars}>
      <div className="tp2-wrap">
        <QuestionCard
          question={q}
          idx={state.idx}
          total={total}
          sectionLabel={sectionLabel}
          answers={state.answers as any}
          setAnswer={setAnswer}
          canNext={canNext}
          validation={validation}
          onPrev={goPrev}
          onNext={() => {
            // 요약에서 섹션 수정으로 들어온 경우: 섹션 끝이면 요약으로 복귀
            if (state.returnToSummary && state.editSection) {
              const nextQ = filteredQuestions[state.idx + 1];
              const isLastOfSection = !nextQ || nextQ.section !== state.editSection;
              if (isLastOfSection) {
                setState((s) => ({ ...s, mode: "summary", returnToSummary: false, editSection: undefined }));
                return;
              }
            }

            if (state.idx === total - 1) setState((s) => ({ ...s, mode: "summary" }));
            else goNext();
          }}
        />
      </div>
    </main>
  );
}

function QuestionCard(props: {
  question: SecondaryQuestion;
  idx: number;
  total: number;
  sectionLabel: string;
  answers: Record<string, any>;
  setAnswer: (id: string, v: any) => void;
  canNext: boolean;
  validation: { ok: boolean; msg?: string };
  onPrev: () => void;
  onNext: () => void;
}) {
  const { question: q, idx, total, sectionLabel, answers, setAnswer, canNext, validation, onPrev, onNext } = props;

  return (
    <article className="tp2-card" aria-label="question-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">
          {sectionLabel} · Q {idx + 1} / {total}
        </div>
        <h2 className="tp2-h2">{q.title}</h2>
        {q.help ? <p className="tp2-body tp2-help">{q.help}</p> : null}
      </header>

      <div className={"tp2-controls " + (q.type === "places" ? "tp2-controlsScrollable" : "")}>
        <QuestionControl q={q} value={answers[q.id]} answers={answers} setAnswer={setAnswer} />
        {!validation.ok ? <div className="tp2-meta">{validation.msg}</div> : null}
      </div>

      <footer className="tp2-footer">
        <button type="button" className="tp2-btn" onClick={onPrev} disabled={idx === 0}>
          이전
        </button>
        <button type="button" className="tp2-btnPrimary" onClick={onNext} disabled={!canNext}>
          {idx === total - 1 ? "설정값 확인" : "다음"}
        </button>
      </footer>
    </article>
  );
}

/* -------- Controls -------- */

function QuestionControl(props: {
  q: SecondaryQuestion;
  value: any;
  answers: Record<string, any>;
  setAnswer: (id: string, v: any) => void;
}) {
  const { q, value, answers, setAnswer } = props;

  switch (q.type) {
    case "segmented":
      return <Segmented options={q.options ?? []} value={value ?? ""} onChange={(v) => setAnswer(q.id, v)} />;

    case "waitingPreset":
      return (
        <WaitingPreset
          preset={value ?? ""}
          customMinutes={answers["b_waitingCustomMinutes"] ?? 20}
          options={q.options ?? []}
          onPreset={(p) => setAnswer(q.id, p)}
          onCustom={(m) => setAnswer("b_waitingCustomMinutes", m)}
        />
      );

    case "tagInput":
      return (
        <TagInput
          tags={Array.isArray(value) ? value : []}
          placeholder={q.placeholder ?? "입력 후 추가"}
          onChange={(next) => setAnswer(q.id, next)}
        />
      );

    case "numberPair":
      return (
        <NumberPair
          nights={answers["g_tripNights"] ?? 0}
          days={answers["g_tripDays"] ?? 1}
          onChange={(n, d) => {
            setAnswer("g_tripNights", n);
            setAnswer("g_tripDays", d);
          }}
        />
      );

    case "numberOne":
      return <NumberOne value={value ?? 1} onChange={(n) => setAnswer(q.id, n)} />;

    case "rankAssign":
      return (
        <RankAssign
          options={q.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={(n) => setAnswer(q.id, n)}
        />
      );

    case "places":
      return <Places places={Array.isArray(value) ? value : []} onChange={(n) => setAnswer(q.id, n)} />;

    case "textarea":
      return <TextArea value={value ?? ""} placeholder={q.placeholder ?? ""} onChange={(v) => setAnswer(q.id, v)} />;

    default:
      return <div className="tp2-meta">Unknown control</div>;
  }
}

function Segmented(props: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tp2-seg">
      {props.options.map((opt) => {
        const active = props.value === opt;
        return (
          <button
            key={opt}
            type="button"
            className={active ? "tp2-segBtn tp2-segBtnActive" : "tp2-segBtn"}
            onClick={() => props.onChange(opt)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function WaitingPreset(props: {
  preset: string;
  customMinutes: number;
  options: string[];
  onPreset: (p: string) => void;
  onCustom: (m: number) => void;
}) {
  const isCustom = props.preset === "직접";
  return (
    <div className="tp2-subcard">
      <Segmented options={props.options} value={props.preset} onChange={props.onPreset} />
      {isCustom ? (
        <div className="tp2-row">
          <input
            className="tp2-input"
            value={String(props.customMinutes ?? 20)}
            onChange={(e) => props.onCustom(Number(e.target.value))}
            inputMode="numeric"
            placeholder="분"
          />
          <div className="tp2-meta">분</div>
        </div>
      ) : null}
    </div>
  );
}

function TagInput(props: { tags: string[]; placeholder: string; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (props.tags.includes(t)) {
      setText("");
      return;
    }
    props.onChange([...props.tags, t]);
    setText("");
  };

  const remove = (tag: string) => props.onChange(props.tags.filter((x) => x !== tag));

  return (
    <div className="tp2-subcard">
      <div className="tp2-row">
        <input
          className="tp2-input"
          value={text}
          placeholder={props.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="tp2-btn" onClick={add}>
          추가
        </button>
      </div>

      <div className="tp2-wrapChips">
        {props.tags.map((tag) => (
          <button key={tag} type="button" className="tp2-chip" onClick={() => remove(tag)} aria-label={`삭제: ${tag}`}>
            {tag}
          </button>
        ))}
        {props.tags.length === 0 ? <div className="tp2-meta">없음</div> : null}
      </div>
    </div>
  );
}

function NumberPair(props: { nights: number; days: number; onChange: (nights: number, days: number) => void }) {
  const [n, setN] = useState<number>(Number(props.nights ?? 0));
  const [d, setD] = useState<number>(Number(props.days ?? 1));

  useEffect(() => {
    setN(Number(props.nights ?? 0));
    setD(Number(props.days ?? 1));
  }, [props.nights, props.days]);

  return (
    <div className="tp2-subcard">
      <div className="tp2-row">
        <input
          className="tp2-input"
          value={String(n)}
          inputMode="numeric"
          onChange={(e) => {
            const x = Number(e.target.value);
            setN(x);
            props.onChange(x, d);
          }}
          placeholder="박"
        />
        <div className="tp2-meta">박</div>

        <input
          className="tp2-input"
          value={String(d)}
          inputMode="numeric"
          onChange={(e) => {
            const x = Number(e.target.value);
            setD(x);
            props.onChange(n, x);
          }}
          placeholder="일"
        />
        <div className="tp2-meta">일</div>
      </div>
    </div>
  );
}

function NumberOne(props: { value: number; onChange: (n: number) => void }) {
  const v = Number(props.value ?? 1);
  return (
    <div className="tp2-subcard">
      <div className="tp2-row">
        <button type="button" className="tp2-btn" onClick={() => props.onChange(Math.max(1, v - 1))}>
          -
        </button>
        <div className="tp2-badge">{v}명</div>
        <button type="button" className="tp2-btn" onClick={() => props.onChange(v + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

/**
 * RankAssign (모바일 탭 기반)
 * - 각 항목에 1~5순위를 부여(중복 불가)
 * - 내부는 swap 방식
 * - 최종값은 1..5 순으로 정렬된 배열
 */
function RankAssign(props: { options: string[]; value: string[]; onChange: (next: string[]) => void }) {
  const initial = useMemo(() => {
    const v = Array.isArray(props.value) ? props.value : [];
    if (v.length === 5) return v;
    return props.options.slice(0, 5);
  }, [props.value, props.options]);

  const [ordered, setOrdered] = useState<string[]>(initial);

  useEffect(() => setOrdered(initial), [initial]);

  const ranks = ["1", "2", "3", "4", "5"];
  const currentRankOf = (item: string) => ordered.findIndex((x) => x === item);

  const setRank = (item: string, rankIndex: number) => {
    const cur = currentRankOf(item);
    if (cur === rankIndex) return;

    const next = [...ordered];
    const swapItem = next[rankIndex];
    next[rankIndex] = item;
    if (cur >= 0) next[cur] = swapItem;

    setOrdered(next);
    props.onChange(next);
  };

  return (
    <div className="tp2-subcard">
      <div className="tp2-meta">각 항목의 순위를 1~5로 지정(중복 불가).</div>
      <div className="tp2-rankGrid">
        {props.options.slice(0, 5).map((item) => {
          const ri = Math.max(0, currentRankOf(item));
          return (
            <div key={item} className="tp2-rankItem">
              <div className="tp2-row">
                <div className="tp2-body">{item}</div>
                <div className="tp2-badge">{ri + 1}순위</div>
              </div>

              <div className="tp2-seg" aria-label={`rank-${item}`}>
                {ranks.map((r, idx) => {
                  const active = idx === ri;
                  return (
                    <button
                      key={r}
                      type="button"
                      className={active ? "tp2-segBtn tp2-segBtnActive" : "tp2-segBtn"}
                      onClick={() => setRank(item, idx)}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type PlaceItem = { name: string; reason: string; importance: "낮" | "중" | "높" };

function Places(props: { places: PlaceItem[]; onChange: (next: PlaceItem[]) => void }) {
  const add = () => props.onChange([...props.places, { name: "", reason: "", importance: "중" }]);

  const update = (idx: number, patch: Partial<PlaceItem>) => {
    props.onChange(props.places.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const remove = (idx: number) => props.onChange(props.places.filter((_, i) => i !== idx));

  const openMapSearch = (query: string) => {
    const q = query.trim();
    if (!q) return;
    const naver = `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
    window.open(naver, "_blank", "noopener,noreferrer");
  };

  const importanceLabel = (x: PlaceItem["importance"]) => {
    if (x === "낮") return "낮(있으면 좋음)";
    if (x === "중") return "중(중요)";
    return "높(핵심)";
  };

  return (
    <div className="tp2-subcard">
      <button type="button" className="tp2-btn" onClick={add}>
        + 장소 추가
      </button>

      {props.places.length === 0 ? <div className="tp2-meta">최소 1개는 추가해야 한다.</div> : null}

      {props.places.map((p, idx) => (
        <div key={idx} className="tp2-subcard">
          <div className="tp2-row">
            <div className="tp2-meta">장소 {idx + 1}</div>
            <button type="button" className="tp2-btn" onClick={() => remove(idx)}>
              삭제
            </button>
          </div>

          <div className="tp2-row">
            <input className="tp2-input" value={p.name} placeholder="장소명" onChange={(e) => update(idx, { name: e.target.value })} />
            <button type="button" className="tp2-btn" onClick={() => openMapSearch(p.name)}>
              지도에서 찾기
            </button>
          </div>

          <TextArea value={p.reason} placeholder="이유(한 줄~두 줄)" onChange={(v) => update(idx, { reason: v })} />

          <div className="tp2-row">
            <div className="tp2-meta">중요도</div>
            <div className="tp2-meta">{importanceLabel(p.importance)}</div>
          </div>

          <Segmented options={["낮", "중", "높"]} value={p.importance} onChange={(v) => update(idx, { importance: v as any })} />
        </div>
      ))}
    </div>
  );
}

function TextArea(props: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <textarea className="tp2-textarea" value={props.value} placeholder={props.placeholder} rows={4} onChange={(e) => props.onChange(e.target.value)} />
  );
}
