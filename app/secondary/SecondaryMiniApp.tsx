"use client";

import { useEffect, useMemo, useState } from "react";
import "./secondary.css";

import {
  secondaryQuestions,
  getCityOptions,
  type SecondaryQuestion,
} from "./secondaryQuestions";

import {
  cloneSecondaryInitialAnswers,
  type SecondaryAnswers,
  type PlaceItem,
  type SecondarySection,
} from "./secondarySchema";

import SecondarySummaryView from "./SecondarySummaryView";
import { loadSecondaryDraft, saveSecondaryDraft } from "@/lib/secondaryStorage";

type Mode = "intro" | "question" | "summary" | "handoff";

type State = {
  mode: Mode;
  idx: number;
  answers: SecondaryAnswers;
  returnToSummary: boolean;
  editSection?: SecondarySection;
};

const DEFAULT_STATE: State = {
  mode: "intro",
  idx: 0,
  answers: cloneSecondaryInitialAnswers(),
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
  H: "마지막 맥락",
};

function buildFollowupSeed(answers: SecondaryAnswers) {
  const country = answers.country === "기타" ? answers.countryOther : answers.country;
  const city = answers.city === "기타" ? answers.cityOther : answers.city;

  return {
    source: "secondary",
    createdAt: new Date().toISOString(),
    summary: {
      country,
      city,
      tripDays: answers.tripDays,

      companionType:
        answers.companionType === "기타"
          ? answers.companionTypeOther
          : answers.companionType,

      partySize: answers.partySize,

      budgetLevel:
        answers.budgetLevel === "기타"
          ? answers.budgetLevelOther
          : answers.budgetLevel,
      budgetSplit: answers.budgetSplit,
      
      firstDayStart:
        answers.firstDayStart === "기타"
          ? answers.firstDayStartOther
          : answers.firstDayStart,

      lastDayEnd:
        answers.lastDayEnd === "기타"
          ? answers.lastDayEndOther
          : answers.lastDayEnd,

      pace: answers.pace === "기타" ? answers.paceOther : answers.pace,

      chronotype:
        answers.chronotype === "기타"
          ? answers.chronotypeOther
          : answers.chronotype,

      restFrequency:
        answers.restFrequency === "기타"
          ? answers.restFrequencyOther
          : answers.restFrequency,

      dailyActivityTolerance:
        answers.dailyActivityTolerance === "기타"
          ? answers.dailyActivityToleranceOther
          : answers.dailyActivityTolerance,

      moveStyle: answers.moveStyle,
      moveStyleOther: answers.moveStyleOther,

      walkTolerance:
        answers.walkTolerance === "기타"
          ? answers.walkToleranceOther
          : answers.walkTolerance,

      transferTolerance:
        answers.transferTolerance === "기타"
          ? answers.transferToleranceOther
          : answers.transferTolerance,

      stayMode:
        answers.stayMode === "기타"
          ? answers.stayModeOther
          : answers.stayMode,

      lodgingPriorities: answers.lodgingPriorities,
      lodgingPrioritiesOther: answers.lodgingPrioritiesOther,

      foodRole:
        answers.foodRole === "기타"
          ? answers.foodRoleOther
          : answers.foodRole,

      foodRestrictions: answers.foodRestrictions,
      foodRestrictionsOther: answers.foodRestrictionsOther,

      waitingTolerance:
        answers.waitingTolerance === "기타"
          ? answers.waitingToleranceOther
          : answers.waitingTolerance,

      primaryGoal:
        answers.primaryGoal === "기타"
          ? answers.primaryGoalOther
          : answers.primaryGoal,

      mustDoTypes: answers.mustDoTypes,
      mustDoTypesOther: answers.mustDoTypesOther,

      avoidTypes: answers.avoidTypes,
      avoidTypesOther: answers.avoidTypesOther,

      mustPlaces: answers.mustPlaces,
      mustExperiences: answers.mustExperiences,
      mustFoods: answers.mustFoods,

      mustStayTogether:
        answers.mustStayTogether === "기타"
          ? answers.mustStayTogetherOther
          : answers.mustStayTogether,

      conflictRule:
        answers.conflictRule === "기타"
          ? answers.conflictRuleOther
          : answers.conflictRule,

      specialCare: answers.specialCare,
      specialContext: answers.specialContext,
      successFeeling: answers.successFeeling,
    },
    rawAnswers: answers,
  };
}

function validateQuestion(
  q: SecondaryQuestion,
  answers: SecondaryAnswers
): { ok: boolean; msg?: string } {
  const v = answers[q.id as keyof SecondaryAnswers] as any;

  if (!q.required) return { ok: true };

  if (q.type === "number") {
    if (!Number.isFinite(Number(v)) || Number(v) <= 0) {
      return { ok: false, msg: "숫자를 입력하세요" };
    }
    return { ok: true };
  }

  if (q.type === "country" || q.type === "city" || q.type === "single") {
    if (!v) return { ok: false, msg: "선택 필요" };

    if (v === "기타") {
      const other = (answers as any)[`${q.id}Other`];
      if (!String(other ?? "").trim()) {
        return { ok: false, msg: "기타 내용 입력" };
      }
    }

    return { ok: true };
  }

  if (q.type === "multi") {
    if (!Array.isArray(v) || v.length === 0) {
      return { ok: false, msg: "최소 1개 선택" };
    }

    if (v.includes("기타")) {
      const other = (answers as any)[`${q.id}Other`];
      if (!String(other ?? "").trim()) {
        return { ok: false, msg: "기타 내용 입력" };
      }
    }

    if (q.id === "foodRestrictions" && v.includes("딱히 없음") && v.length > 1) {
      return { ok: false, msg: "‘딱히 없음’은 단독 선택" };
    }

    return { ok: true };
  }

  if (q.type === "budgetSplit") {
  const b = v as
    | { food: number; activity: number; stay: number; shopping: number }
    | undefined;

  if (!b) {
    return { ok: false, msg: "예산 분배 입력" };
  }

  const total = b.food + b.activity + b.stay + b.shopping;

  if (total !== 10) {
    return { ok: false, msg: "총합이 10이 되도록 입력하세요" };
  }

  return { ok: true };
}

  if (q.type === "places") {
    if (!Array.isArray(v) || v.length === 0) {
      return { ok: false, msg: "장소 최소 1개 입력" };
    }

    for (const p of v as PlaceItem[]) {
      if (!p.name?.trim()) return { ok: false, msg: "장소 이름 입력" };
      if (!p.reason?.trim()) return { ok: false, msg: "이유 입력" };
      if (!p.importance) return { ok: false, msg: "중요도 선택" };
    }

    return { ok: true };
  }

  return { ok: true };
}

export default function SecondaryMiniApp() {
  const [state, setState] = useState<State>(DEFAULT_STATE);

  useEffect(() => {
    const draft = loadSecondaryDraft();
    if (!draft) return;

    setState((s) => ({
      ...s,
      answers: {
        ...cloneSecondaryInitialAnswers(),
        ...(draft.answers ?? {}),
      },
      idx: typeof draft.idx === "number" ? draft.idx : 0,
      mode: (draft.mode ?? "intro") as Mode,
      returnToSummary: !!draft.returnToSummary,
      editSection: draft.editSection as SecondarySection | undefined,
    }));
  }, []);

  useEffect(() => {
    saveSecondaryDraft({
      mode: state.mode,
      idx: state.idx,
      answers: state.answers,
      returnToSummary: state.returnToSummary,
      editSection: state.editSection,
    });
  }, [state]);

  const filteredQuestions = useMemo(() => {
    return secondaryQuestions.filter((q) => {
      if (!q.showWhen) return true;
      return q.showWhen(state.answers);
    });
  }, [state.answers]);

  useEffect(() => {
    const max = Math.max(0, filteredQuestions.length - 1);
    if (state.idx <= max) return;

    setState((s) => ({
      ...s,
      idx: max,
    }));
  }, [filteredQuestions.length, state.idx]);

  const current = filteredQuestions[state.idx] ?? filteredQuestions[0];
  const validation = current
    ? validateQuestion(current, state.answers)
    : { ok: false, msg: "질문 없음" };

  function setAnswer(id: string, value: any) {
    setState((s) => {
      const nextAnswers = {
        ...s.answers,
        [id]: value,
      } as SecondaryAnswers;

      if (id === "country") {
        nextAnswers.city = "";
        nextAnswers.cityOther = "";
      }

      if (id === "companionType" && value === "혼자") {
        nextAnswers.mustStayTogether = "";
        nextAnswers.mustStayTogetherOther = "";
        nextAnswers.conflictRule = "";
        nextAnswers.conflictRuleOther = "";
        nextAnswers.specialCare = "";
      }

      return {
        ...s,
        answers: nextAnswers,
      };
    });
  }

  function setOther(id: string, value: string) {
    setState((s) => ({
      ...s,
      answers: {
        ...s.answers,
        [`${id}Other`]: value,
      } as SecondaryAnswers,
    }));
  }

  function goPrev() {
    setState((s) => ({
      ...s,
      idx: Math.max(0, s.idx - 1),
    }));
  }

  function goNext() {
    if (!validation.ok) return;

    if (state.returnToSummary && state.editSection) {
      const nextQ = filteredQuestions[state.idx + 1];
      const isLastOfSection = !nextQ || nextQ.section !== state.editSection;

      if (isLastOfSection) {
        setState((s) => ({
          ...s,
          mode: "summary",
          returnToSummary: false,
          editSection: undefined,
        }));
        return;
      }
    }

    if (state.idx === filteredQuestions.length - 1) {
      setState((s) => ({
        ...s,
        mode: "summary",
      }));
      return;
    }

    setState((s) => ({
      ...s,
      idx: Math.min(filteredQuestions.length - 1, s.idx + 1),
    }));
  }

  function goToSection(section: SecondarySection) {
    const idx = filteredQuestions.findIndex((q) => q.section === section);

    setState((s) => ({
      ...s,
      mode: "question",
      idx: idx >= 0 ? idx : 0,
      returnToSummary: true,
      editSection: section,
    }));
  }
    function renderQuestion(
    q: SecondaryQuestion,
    answers: SecondaryAnswers
  ) {
    const value = answers[q.id as keyof SecondaryAnswers] as any;

    switch (q.type) {
      case "country":
        return (
          <CountryControl
            value={answers.country}
            onChange={(v) => setAnswer("country", v)}
          />
        );

      case "city":
        return (
          <CityControl
            country={answers.country}
            value={answers.city}
            other={answers.cityOther}
            onChange={(v) => setAnswer("city", v)}
            onChangeOther={(v) => setOther("city", v)}
          />
        );

      case "single":
        return (
          <SingleSelect
            options={q.options ?? []}
            value={String(value ?? "")}
            other={String((answers as any)[`${q.id}Other`] ?? "")}
            onChange={(v) => setAnswer(q.id, v)}
            onChangeOther={(v) => setOther(q.id, v)}
          />
        );

      case "multi":
        return (
          <MultiSelect
            id={q.id}
            options={q.options ?? []}
            value={Array.isArray(value) ? value : []}
            maxSelect={q.maxSelect}
            other={String((answers as any)[`${q.id}Other`] ?? "")}
            onChange={(v) => setAnswer(q.id, v)}
            onChangeOther={(v) => setOther(q.id, v)}
          />
        );

      case "number":
        return (
          <NumberInput
            value={Number(value ?? (q.id === "tripDays" ? 3 : 1))}
            suffix={q.id === "tripDays" ? "일" : "명"}
            onChange={(v) => setAnswer(q.id, v)}
          />
        );

      case "places":
        return (
          <PlacesInput
            value={Array.isArray(value) ? value : []}
            onChange={(v) => setAnswer(q.id, v)}
          />
        );

    

      case "textarea":
        return (
          <TextArea
            value={String(value ?? "")}
            placeholder={q.placeholder ?? ""}
            maxLength={200}
            onChange={(v) => setAnswer(q.id, v)}
          />
        );

      case "budgetSplit": {
  const bs = answers.budgetSplit;

  const update = (key: keyof typeof bs, value: number) => {
    setAnswer("budgetSplit", {
      ...bs,
      [key]: value,
    });
  };

  const total =
    bs.food + bs.activity + bs.stay + bs.shopping;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          fontSize: 14,
          opacity: 0.7,
        }}
      >
        총합 {total} / 10
      </div>

      <label>
        음식
        <input
          type="number"
          min={0}
          max={10}
          value={bs.food}
          onChange={(e) =>
            update("food", Number(e.target.value))
          }
        />
      </label>

      <label>
        활동 / 경험
        <input
          type="number"
          min={0}
          max={10}
          value={bs.activity}
          onChange={(e) =>
            update("activity", Number(e.target.value))
          }
        />
      </label>

      <label>
        숙소
        <input
          type="number"
          min={0}
          max={10}
          value={bs.stay}
          onChange={(e) =>
            update("stay", Number(e.target.value))
          }
        />
      </label>

      <label>
        쇼핑
        <input
          type="number"
          min={0}
          max={10}
          value={bs.shopping}
          onChange={(e) =>
            update("shopping", Number(e.target.value))
          }
        />
      </label>
    </div>
  );
}
      
      

      default:
        return null;
    }
  }

  function renderQuestionCard() {
    if (!current) {
      return (
        <article className="tp2-card">
          <header className="tp2-cardHeader">
            <div className="tp2-meta">설문 2</div>
            <h2 className="tp2-h2">질문을 불러오지 못했다.</h2>
          </header>
        </article>
      );
    }

    const sectionLabel = SECTION_LABEL[current.section];

    return (
      <article className="tp2-card">
        <header className="tp2-cardHeader">
          <div className="tp2-meta">
            {sectionLabel} · Q {state.idx + 1} / {filteredQuestions.length}
          </div>

          <h2 className="tp2-h2">{current.title}</h2>

          {current.help ? (
            <p className="tp2-body tp2-help">{current.help}</p>
          ) : null}
        </header>

        <div className="tp2-controls">
          {renderQuestion(current, state.answers)}

          {!validation.ok ? (
            <div className="tp2-meta">{validation.msg}</div>
          ) : null}
        </div>

        <footer className="tp2-footer">
          <button
            type="button"
            className="tp2-btn"
            onClick={goPrev}
            disabled={state.idx === 0}
          >
            이전
          </button>

          <button
            type="button"
            className="tp2-btnPrimary"
            onClick={goNext}
            disabled={!validation.ok}
          >
            {state.idx === filteredQuestions.length - 1
              ? "설정값 확인"
              : "다음"}
          </button>
        </footer>
      </article>
    );
  }

  function renderIntro() {
    return (
      <article className="tp2-card">
        <header className="tp2-cardHeader">
          <div className="tp2-meta">설문 2</div>
          <h2 className="tp2-h2">여행 세부 설정 입력</h2>
          <p className="tp2-body tp2-help">
            실제 일정 생성에 필요한 컨텍스트/제약/우선순위를 입력한다.
          </p>
        </header>

        <div className="tp2-controls">
          <div className="tp2-meta">
            국가·도시 → 기간 → 제약/우선순위 → 핵심 장소(이유)
          </div>
        </div>

        <footer className="tp2-footer">
          <button
            type="button"
            className="tp2-btnPrimary"
            onClick={() =>
              setState((s) => ({
                ...s,
                mode: "question",
                idx: 0,
              }))
            }
          >
            시작
          </button>
        </footer>
      </article>
    );
  }

  function renderSummary() {
    return (
      <SecondarySummaryView
        questions={filteredQuestions}
        answers={state.answers}
        onEditSection={(section: SecondarySection) => {
          goToSection(section);
        }}
        onBack={() => {
          setState((s) => ({
            ...s,
            mode: "question",
            idx: 0,
            returnToSummary: false,
            editSection: undefined,
          }));
        }}
        onReview={() => {
          setState((s) => ({
            ...s,
            mode: "handoff",
          }));
        }}
      />
    );
  }

  function renderHandoff() {
    return (
      <article className="tp2-card">
        <header className="tp2-cardHeader">
          <div className="tp2-meta">다음 단계</div>
          <h2 className="tp2-h2">마지막으로 몇 가지만 더 물어볼게.</h2>
          <p className="tp2-body tp2-help">
            지금까지의 설문 내용을 바탕으로,
            일정 품질을 더 높이기 위해 부족한 정보만 짧게 물어본다.
          </p>
        </header>

        <div className="tp2-controls">
          <div className="tp2-meta">
            이 단계는 1~2분 안에 끝나며,
            설문 1·2에서 애매했던 부분만 보충한다.
          </div>
        </div>

        <footer className="tp2-footer">
          <button
            type="button"
            className="tp2-btn"
            onClick={() =>
              setState((s) => ({
                ...s,
                mode: "summary",
              }))
            }
          >
            이전
          </button>

          <button
            type="button"
            className="tp2-btnPrimary"
            onClick={() => {
              const seed = buildFollowupSeed(state.answers);
              sessionStorage.setItem(
                "triplan_followup_seed",
                JSON.stringify(seed)
              );
              window.location.href = "/followup";
            }}
          >
            알겠다
          </button>
        </footer>
      </article>
    );
  }
  function CountryControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: "KR" | "JP") => void;
}) {
  const options: ("KR" | "JP")[] = ["KR"];

  return (
    <div className="tp2-seg">
      {options.map((cc) => {
        const active = value === cc;
        return (
          <button
            key={cc}
            type="button"
            className={active ? "tp2-segBtn tp2-segBtnActive" : "tp2-segBtn"}
            onClick={() => onChange(cc)}
          >
            {cc === "KR" ? "한국" : "일본"}
          </button>
        );
      })}
    </div>
  );
}

function CityControl({
  country,
  value,
  other,
  onChange,
  onChangeOther,
}: {
  country: string;
  value: string;
  other: string;
  onChange: (v: string) => void;
  onChangeOther: (v: string) => void;
}) {
  const options = country ? [...getCityOptions(country), "기타"] : [];

  if (!country) {
    return <div className="tp2-meta">먼저 국가를 선택하세요.</div>;
  }

  return (
    <div>
      <div className="tp2-seg">
        {options.map((city) => {
          const active = value === city;

          return (
            <button
              key={city}
              type="button"
              className={active ? "tp2-segBtn tp2-segBtnActive" : "tp2-segBtn"}
              onClick={() => onChange(city)}
            >
              {city}
            </button>
          );
        })}
      </div>

      {value === "기타" ? (
        <input
          className="tp2-input"
          value={other}
          placeholder="도시 입력"
          onChange={(e) => onChangeOther(e.target.value)}
        />
      ) : null}
    </div>
  );
}

function SingleSelect({
  options,
  value,
  other,
  onChange,
  onChangeOther,
}: {
  options: string[];
  value: string;
  other: string;
  onChange: (v: string) => void;
  onChangeOther: (v: string) => void;
}) {
  return (
    <div>
      <div className="tp2-seg">
        {options.map((opt) => {
          const active = value === opt;

          return (
            <button
              key={opt}
              type="button"
              className={active ? "tp2-segBtn tp2-segBtnActive" : "tp2-segBtn"}
              onClick={() => onChange(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {value === "기타" ? (
        <input
          className="tp2-input"
          value={other}
          placeholder="기타 입력"
          onChange={(e) => onChangeOther(e.target.value)}
        />
      ) : null}
    </div>
  );
}

function MultiSelect({
  options,
  value,
  maxSelect,
  other,
  id,
  onChange,
  onChangeOther,
}: {
  options: string[];
  value: string[];
  maxSelect?: number;
  other: string;
  id: string;
  onChange: (v: string[]) => void;
  onChangeOther: (v: string) => void;
}) {
  function toggle(opt: string) {
    const has = value.includes(opt);
    let next = has ? value.filter((x) => x !== opt) : [...value, opt];

    if (id === "foodRestrictions") {
      if (opt === "딱히 없음") {
        next = has ? [] : ["딱히 없음"];
      } else {
        next = next.filter((x) => x !== "딱히 없음");
      }
    }

    if (maxSelect) {
      const effectiveCount = next.filter((x) => x !== "기타").length;
      if (!has && opt !== "기타" && effectiveCount > maxSelect) {
        return;
      }
    }

    onChange(next);
  }

  return (
    <div>
      <div className="tp2-seg">
        {options.map((opt) => {
          const active = value.includes(opt);

          return (
            <button
              key={opt}
              type="button"
              className={active ? "tp2-segBtn tp2-segBtnActive" : "tp2-segBtn"}
              onClick={() => toggle(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {value.includes("기타") ? (
        <input
          className="tp2-input"
          value={other}
          placeholder="기타 입력"
          onChange={(e) => onChangeOther(e.target.value)}
        />
      ) : null}
    </div>
  );
}

function NumberInput({
  value,
  suffix,
  onChange,
}: {
  value: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  const v = Math.max(1, Number(value || 1));

  return (
    <div className="tp2-row">
      <button type="button" className="tp2-btn" onClick={() => onChange(v - 1)}>
        -
      </button>

      <div className="tp2-meta">
        {v}
        {suffix}
      </div>

      <button type="button" className="tp2-btn" onClick={() => onChange(v + 1)}>
        +
      </button>
    </div>
  );
}

function PlacesInput({
  value,
  onChange,
}: {
  value: PlaceItem[];
  onChange: (v: PlaceItem[]) => void;
}) {
  const add = () => {
    onChange([...value, { name: "", reason: "", importance: "중" }]);
  };

  const update = (i: number, patch: Partial<PlaceItem>) => {
    const next = value.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <button type="button" className="tp2-btn" onClick={add}>
        + 장소 추가
      </button>

      {value.length === 0 ? <div className="tp2-meta">최소 1개 입력</div> : null}

      {value.map((p, i) => (
        <div key={i} className="tp2-subcard">
          <input
            className="tp2-input"
            placeholder="장소 이름"
            value={p.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />

          <textarea
            className="tp2-textarea"
            placeholder="왜 가고 싶은지"
            
            value={p.reason}
            onChange={(e) => update(i, { reason: e.target.value })}
          />

          <SingleSelect
            options={["낮", "중", "높"]}
            value={p.importance}
            other=""
            onChange={(v) => update(i, { importance: v as "낮" | "중" | "높" })}
            onChangeOther={() => {}}
          />

          <button type="button" className="tp2-btn" onClick={() => remove(i)}>
            삭제
          </button>
        </div>
      ))}
    </div>
  );
}



function TextArea({
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  value: string;
  placeholder: string;
  maxLength?: number;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      className="tp2-textarea"
      value={value}
      placeholder={placeholder}
      maxLength={200}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

let content: React.ReactNode;

if (state.mode === "intro") {
  content = renderIntro();
} else if (state.mode === "summary") {
  content = renderSummary();
} else if (state.mode === "handoff") {
  content = renderHandoff();
} else {
  content = renderQuestionCard();
}

return (
  <main className="tp2-page">
    <div className="tp2-shell">{content}</div>
  </main>
);
}
