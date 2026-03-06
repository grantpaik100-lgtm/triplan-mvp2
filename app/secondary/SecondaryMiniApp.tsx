"use client";

import { useEffect, useMemo, useState } from "react";

import {
  secondaryQuestions,
  getCityOptions,
  type SecondaryQuestion,
} from "./secondaryQuestions";

import {
  cloneSecondaryInitialAnswers,
  type SecondaryAnswers,
  type PlaceItem,
} from "./secondarySchema";

import SecondarySummaryView from "./SecondarySummaryView";

import { loadSecondaryDraft, saveSecondaryDraft } from "@/lib/secondaryStorage";

type Mode = "intro" | "question" | "summary" | "handoff";

type State = {
  mode: Mode;
  idx: number;
  answers: SecondaryAnswers;
  returnToSummary: boolean;
};

const DEFAULT_STATE: State = {
  mode: "intro",
  idx: 0,
  answers: cloneSecondaryInitialAnswers(),
  returnToSummary: false,
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
        answers.stayMode === "기타" ? answers.stayModeOther : answers.stayMode,
      lodgingPriorities: answers.lodgingPriorities,
      lodgingPrioritiesOther: answers.lodgingPrioritiesOther,

      foodRole:
        answers.foodRole === "기타" ? answers.foodRoleOther : answers.foodRole,
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

export default function SecondaryMiniApp() {
  const [state, setState] = useState<State>(DEFAULT_STATE);

  useEffect(() => {
    const draft = loadSecondaryDraft();
    if (draft) {
      setState((s) => ({
        ...s,
        answers: draft.answers ?? cloneSecondaryInitialAnswers(),
        idx: draft.idx ?? 0,
      }));
    }
  }, []);

  useEffect(() => {
    saveSecondaryDraft({
      idx: state.idx,
      answers: state.answers,
    });
  }, [state.idx, state.answers]);

  const filteredQuestions = useMemo(() => {
    return secondaryQuestions.filter((q) => {
      if (!q.showWhen) return true;
      return q.showWhen(state.answers);
    });
  }, [state.answers]);

  const current = filteredQuestions[state.idx];

  function setAnswer(id: string, value: any) {
    setState((s) => ({
      ...s,
      answers: {
        ...s.answers,
        [id]: value,
      },
    }));
  }

  function setOther(id: string, value: string) {
    setState((s) => ({
      ...s,
      answers: {
        ...s.answers,
        [`${id}Other`]: value,
      } as any,
    }));
  }

  function validateQuestion(q: SecondaryQuestion): { ok: boolean; msg?: string } {
    const v = (state.answers as any)[q.id];

    if (!q.required) return { ok: true };

    if (q.type === "number") {
      if (!Number.isFinite(Number(v)) || Number(v) <= 0) {
        return { ok: false, msg: "숫자를 입력하세요" };
      }
      return { ok: true };
    }

    if (q.type === "single" || q.type === "country" || q.type === "city") {
      if (!v) return { ok: false, msg: "선택 필요" };

      if (v === "기타") {
        const other = (state.answers as any)[`${q.id}Other`];
        if (!other?.trim()) return { ok: false, msg: "기타 내용 입력" };
      }

      return { ok: true };
    }

    if (q.type === "multi") {
      if (!Array.isArray(v) || v.length === 0) {
        return { ok: false, msg: "최소 1개 선택" };
      }

      if (v.includes("기타")) {
        const other = (state.answers as any)[`${q.id}Other`];
        if (!other?.trim()) return { ok: false, msg: "기타 내용 입력" };
      }

      if (q.id === "foodRestrictions" && v.includes("딱히 없음") && v.length > 1) {
        return { ok: false, msg: "‘딱히 없음’은 단독 선택" };
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
      }

      return { ok: true };
    }

    return { ok: true };
  }
}
/* =========================
   Country Control
========================= */

function CountryControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: "KR" | "JP") => void;
}) {
  const options: ("KR" | "JP")[] = ["KR", "JP"];

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

/* =========================
   City Control
========================= */

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

      {value === "기타" && (
        <input
          className="tp2-input"
          value={other}
          placeholder="도시 입력"
          onChange={(e) => onChangeOther(e.target.value)}
        />
      )}
    </div>
  );
}

/* =========================
   Single Select
========================= */

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

      {value === "기타" && (
        <input
          className="tp2-input"
          value={other}
          placeholder="기타 입력"
          onChange={(e) => onChangeOther(e.target.value)}
        />
      )}
    </div>
  );
}

/* =========================
   Multi Select
========================= */

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

    if (maxSelect && next.length > maxSelect && !has) {
      return;
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

      {value.includes("기타") && (
        <input
          className="tp2-input"
          value={other}
          placeholder="기타 입력"
          onChange={(e) => onChangeOther(e.target.value)}
        />
      )}
    </div>
  );
}

/* =========================
   Number Input
========================= */

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
/* =========================
   Places Input
========================= */

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

      {value.length === 0 && <div className="tp2-meta">최소 1개 입력</div>}

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
            onChange={(v) => update(i, { importance: v as any })}
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

/* =========================
   TextList Input
========================= */

function TextListInput({
  value,
  maxItems,
  placeholder,
  onChange,
}: {
  value: string[];
  maxItems: number;
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState("");

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (value.includes(t)) return;
    if (value.length >= maxItems) return;

    onChange([...value, t]);
    setText("");
  };

  const remove = (item: string) => {
    onChange(value.filter((x) => x !== item));
  };

  return (
    <div>
      <div className="tp2-row">
        <input
          className="tp2-input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <button type="button" className="tp2-btn" onClick={add}>
          추가
        </button>
      </div>

      <div className="tp2-wrapChips">
        {value.map((v) => (
          <button
            key={v}
            className="tp2-chip"
            type="button"
            onClick={() => remove(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/* =========================
   Textarea
========================= */

function TextArea({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      className="tp2-textarea"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* =========================
   Question Renderer
========================= */

function renderQuestion(
  q: SecondaryQuestion,
  answers: SecondaryAnswers,
  setAnswer: any,
  setOther: any
) {
  const value = (answers as any)[q.id];

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
          value={value}
          other={(answers as any)[`${q.id}Other`] ?? ""}
          onChange={(v) => setAnswer(q.id, v)}
          onChangeOther={(v) => setOther(q.id, v)}
        />
      );

    case "multi":
      return (
        <MultiSelect
          id={q.id}
          options={q.options ?? []}
          value={value ?? []}
          maxSelect={q.maxSelect}
          other={(answers as any)[`${q.id}Other`] ?? ""}
          onChange={(v) => setAnswer(q.id, v)}
          onChangeOther={(v) => setOther(q.id, v)}
        />
      );

    case "number":
      return (
        <NumberInput
          value={value}
          suffix={q.id === "tripDays" ? "일" : "명"}
          onChange={(v) => setAnswer(q.id, v)}
        />
      );

    case "places":
      return (
        <PlacesInput
          value={value ?? []}
          onChange={(v) => setAnswer(q.id, v)}
        />
      );

    case "textList":
      return (
        <TextListInput
          value={value ?? []}
          maxItems={q.maxItems ?? 5}
          placeholder={q.placeholder ?? ""}
          onChange={(v) => setAnswer(q.id, v)}
        />
      );

    case "textarea":
      return (
        <TextArea
          value={value ?? ""}
          placeholder={q.placeholder ?? ""}
          onChange={(v) => setAnswer(q.id, v)}
        />
      );

    default:
      return null;
  }
}

/* =========================
   Navigation Renderer
========================= */

function QuestionUI({
  q,
  idx,
  total,
  answers,
  setAnswer,
  setOther,
  validation,
  goPrev,
  goNext,
}: any) {
  return (
    <article className="tp2-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">
          Q {idx + 1} / {total}
        </div>

        <h2 className="tp2-h2">{q.title}</h2>

        {q.help && <p className="tp2-body tp2-help">{q.help}</p>}
      </header>

      <div className="tp2-controls">
        {renderQuestion(q, answers, setAnswer, setOther)}

        {!validation.ok && (
          <div className="tp2-meta">{validation.msg}</div>
        )}
      </div>

      <footer className="tp2-footer">
        <button
          type="button"
          className="tp2-btn"
          onClick={goPrev}
          disabled={idx === 0}
        >
          이전
        </button>

        <button
          type="button"
          className="tp2-btnPrimary"
          onClick={goNext}
          disabled={!validation.ok}
        >
          {idx === total - 1 ? "설정값 확인" : "다음"}
        </button>
      </footer>
    </article>
  );
}

/* =========================
   Main Render Override
========================= */

function SecondaryMiniAppBody({
  state,
  current,
  filteredQuestions,
  validation,
  setAnswer,
  setOther,
  setState,
}: {
  state: State;
  current: SecondaryQuestion;
  filteredQuestions: SecondaryQuestion[];
  validation: { ok: boolean; msg?: string };
  setAnswer: (id: string, value: any) => void;
  setOther: (id: string, value: string) => void;
  setState: React.Dispatch<React.SetStateAction<State>>;
}) {
  const total = filteredQuestions.length;

  const goPrev = () => {
    setState((s) => ({
      ...s,
      idx: Math.max(0, s.idx - 1),
    }));
  };

  const goNext = () => {
    if (!validation.ok) return;

    if (state.idx === total - 1) {
      setState((s) => ({
        ...s,
        mode: "summary",
      }));
      return;
    }

    setState((s) => ({
      ...s,
      idx: Math.min(total - 1, s.idx + 1),
    }));
  };

  return (
    <QuestionUI
      q={current}
      idx={state.idx}
      total={total}
      answers={state.answers}
      setAnswer={setAnswer}
      setOther={setOther}
      validation={validation}
      goPrev={goPrev}
      goNext={goNext}
    />
  );
}

/* =========================
   Root Return Helper
========================= */

export function SecondaryMiniAppRender({
  state,
  filteredQuestions,
  current,
  validation,
  setAnswer,
  setOther,
  setState,
}: any) {
  if (state.mode === "intro") {
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
              setState((s: State) => ({
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

  if (state.mode === "summary") {
    return (
      <SecondarySummaryView
        questions={filteredQuestions}
        answers={state.answers}
        onEditSection={() => {
          setState((s: State) => ({
            ...s,
            mode: "question",
            idx: 0,
          }));
        }}
        onBack={() => {
          setState((s: State) => ({
            ...s,
            mode: "question",
            idx: 0,
          }));
        }}
        onReview={() => {
          setState((s: State) => ({
            ...s,
            mode: "handoff",
          }));
        }}
      />
    );
  }

  if (state.mode === "handoff") {
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
              setState((s: State) => ({
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

  return (
    <SecondaryMiniAppBody
      state={state}
      current={current}
      filteredQuestions={filteredQuestions}
      validation={validation}
      setAnswer={setAnswer}
      setOther={setOther}
      setState={setState}
    />
  );
}
