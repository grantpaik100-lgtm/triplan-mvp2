// app/secondary/SecondaryMiniApp.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { secondaryQuestions, type SecondaryQuestion } from "./secondaryQuestions";
import { secondarySchema, type SecondaryAnswers } from "./secondarySchema";
import { loadSecondaryDraft, saveSecondaryDraft, clearSecondaryDraft } from "@/lib/secondaryStorage";

import { MOTION, GLASS, SHADOW, COLORS, SPACE, TYPE, DENSITY, RADIUS, MAXWIDTH, Z, FOCUS_RING } from "@/lib/MOTION_TOKENS";
import SecondarySummaryView from "./SecondarySummaryView";

type Mode = "question" | "summary";
type State = { mode: Mode; idx: number; answers: SecondaryAnswers | Record<string, any> };

const DEFAULT_STATE: State = { mode: "question", idx: 0, answers: {} };

function getRequiredIds(answers: Record<string, any>) {
  const groupMode = answers?.e_groupMode ?? "혼자";
  const base = [
    "a_rhythm",
    "a_density",
    "b_waitingPreset",
    "d_lodgingStrategy",
    "f_places",
    "f_placeReasonOneLine",
  ];
  if (groupMode === "여럿") base.push("e_conflictRule");
  return new Set(base);
}

function validateQuestion(q: any, answers: Record<string, any>): { ok: boolean; msg?: string } {
  const required = getRequiredIds(answers).has(q.id);
  const v = answers[q.id];

  if (!required) return { ok: true };

  // 공통: 빈 값
  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
    return { ok: false, msg: "필수 항목" };
  }

  // waitingPreset: 직접이면 customMinutes 필요
  if (q.id === "b_waitingPreset") {
    if (v === "직접") {
      const m = answers["b_waitingCustomMinutes"];
      if (m == null || Number.isNaN(Number(m))) return { ok: false, msg: "직접 입력 분을 설정" };
    }
  }

  // places: 각 카드의 핵심 입력 최소 검증
  if (q.id === "f_places") {
    if (!Array.isArray(v) || v.length < 1) return { ok: false, msg: "장소를 최소 1개 추가" };
    for (const p of v) {
      if (!p?.name?.trim()) return { ok: false, msg: "장소명 입력" };
      if (!p?.reason?.trim()) return { ok: false, msg: "장소 이유 입력" };
      if (!p?.importance) return { ok: false, msg: "중요도 선택" };
    }
  }

  // textarea
  if (q.type === "textarea") {
    if (!String(v).trim()) return { ok: false, msg: "내용 입력" };
  }

  return { ok: true };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toCssVars(densityKey: keyof typeof DENSITY, progressPct: number) {
  const d = DENSITY[densityKey];

  // “값”은 전부 토큰에서 오고, 여기서는 변수 매핑만 한다.
  // px/ms 단위는 CSS에서 calc(*1px), calc(*1ms)로 처리.
  return {
    // colors
    ["--tp2-sky1" as any]: COLORS.sky1,
    ["--tp2-sky2" as any]: COLORS.sky2,
    ["--tp2-text" as any]: COLORS.text,
    ["--tp2-muted" as any]: COLORS.muted,
    ["--tp2-line" as any]: COLORS.line,
    ["--tp2-focusColor" as any]: COLORS.focus,

    // focus + glass + shadow
    ["--tp2-focus" as any]: FOCUS_RING.ring,
    ["--tp2-glass-bg" as any]: GLASS.background,
    ["--tp2-glass-border" as any]: GLASS.border,
    ["--tp2-glass-blur" as any]: GLASS.backdropBlurPx,

    ["--tp2-shadow-1" as any]: SHADOW.level1,
    ["--tp2-shadow-2" as any]: SHADOW.level2,
    ["--tp2-shadow-3" as any]: SHADOW.level3,

    // motion
    ["--tp2-easing" as any]: MOTION.easing,
    ["--tp2-dur-fast" as any]: MOTION.duration.fast,
    ["--tp2-dur-base" as any]: MOTION.duration.base,
    ["--tp2-dur-slow" as any]: MOTION.duration.slow,
    ["--tp2-dur-page" as any]: MOTION.duration.page,

    // motion enter state (CSS에서 읽어 씀)
    ["--tp2-enter-opacity-from" as any]: MOTION.enter.from.opacity,
    ["--tp2-enter-scale-from" as any]: MOTION.enter.from.scale,
    ["--tp2-enter-blur-from" as any]: MOTION.enter.from.blurPx,

    ["--tp2-enter-opacity-to" as any]: MOTION.enter.to.opacity,
    ["--tp2-enter-scale-to" as any]: MOTION.enter.to.scale,
    ["--tp2-enter-blur-to" as any]: MOTION.enter.to.blurPx,

    // spacing
    ["--tp2-space-6" as any]: SPACE[6],
    ["--tp2-space-8" as any]: SPACE[8],
    ["--tp2-space-10" as any]: SPACE[10],
    ["--tp2-space-12" as any]: SPACE[12],
    ["--tp2-space-16" as any]: SPACE[16],

    // type
    ["--tp2-h2-size" as any]: TYPE.h2.size,
    ["--tp2-h2-lh" as any]: TYPE.h2.lineHeight,
    ["--tp2-h2-w" as any]: TYPE.h2.weight,

    ["--tp2-title-size" as any]: TYPE.title.size,
    ["--tp2-title-lh" as any]: TYPE.title.lineHeight,
    ["--tp2-title-w" as any]: TYPE.title.weight,

    ["--tp2-body-size" as any]: TYPE.body.size,
    ["--tp2-body-lh" as any]: TYPE.body.lineHeight,
    ["--tp2-body-w" as any]: TYPE.body.weight,

    ["--tp2-caption-size" as any]: TYPE.caption.size,
    ["--tp2-caption-lh" as any]: TYPE.caption.lineHeight,
    ["--tp2-caption-w" as any]: TYPE.caption.weight,

    // density
    ["--tp2-card-pad-x" as any]: d.cardPadX,
    ["--tp2-card-pad-y" as any]: d.cardPadY,
    ["--tp2-row-gap" as any]: d.rowGap,
    ["--tp2-btn-h" as any]: d.buttonHeight,

    // radius / layout
    ["--tp2-radius-lg" as any]: RADIUS.lg,
    ["--tp2-radius-pill" as any]: RADIUS.pill,
    ["--tp2-max-card" as any]: MAXWIDTH.card,

    // z
    ["--tp2-z-sticky" as any]: Z.sticky,

    // progress
    ["--tp2-progress" as any]: progressPct,
  } as React.CSSProperties;
}

export default function SecondaryMiniApp() {
  

  const [state, setState] = useState<State>(DEFAULT_STATE);

  const filteredQuestions = useMemo(() => {
    const a = state.answers as any;
    const groupMode = a?.e_groupMode ?? "혼자";

    return secondaryQuestions.filter((qq) => {
      if (qq.id === "e_conflictRule" && groupMode !== "여럿") return false;
      return true;
    });
  }, [state.answers]);

const total = filteredQuestions.length;
const q = (total > 0
  ? filteredQuestions[clamp(state.idx, 0, total - 1)]
  : secondaryQuestions[0])!;

  useEffect(() => {
  const max = Math.max(0, filteredQuestions.length - 1);
  if (state.idx <= max) return;
  setState((s) => ({ ...s, idx: max }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filteredQuestions.length]); 
  

  // draft load
  useEffect(() => {
    const draft = loadSecondaryDraft();
    if (!draft) return;

    setState((s) => ({
      ...s,
      mode: (draft.mode as Mode) ?? "question",
      idx: clamp(draft.idx ?? 0, 0, total - 1),
      answers: (draft.answers ?? {}) as any,
    }));
  }, [total]);

  // draft save
  useEffect(() => {
    saveSecondaryDraft(state);
  }, [state]);

  const progressPct = useMemo(() => {
    if (total <= 1) return 0;
    return Math.round((state.idx / (total - 1)) * 100);
  }, [state.idx, total]);

  const cssVars = useMemo(() => toCssVars("base", progressPct), [progressPct]) ;

  const setAnswer = (id: string, value: any) => {
    setState((s) => ({ ...s, answers: { ...(s.answers as any), [id]: value } }));
  };

  const goPrev = () => setState((s) => ({ ...s, idx: clamp(s.idx - 1, 0, total - 1) }));
  const goNext = () => setState((s) => ({ ...s, idx: clamp(s.idx + 1, 0, total - 1) }));
  const goSummary = () => setState((s) => ({ ...s, mode: "summary" }));
  const goQuestionAt = (idx: number) => setState((s) => ({ ...s, mode: "question", idx: clamp(idx, 0, total - 1) }));

  const resetDraft = () => {
    clearSecondaryDraft();
    setState(DEFAULT_STATE);
  };

  const canGoNext = useMemo(() => {
  const answers = state.answers as any;
  const res = validateQuestion(q, answers);
  return res.ok;
}, [q, state.answers]);;
  const validation = useMemo(() => validateQuestion(q, state.answers as any), [q, state.answers]);

  const onFinish = () => {
    const parsed = secondarySchema.safeParse(state.answers);
    if (!parsed.success) return;
    goSummary();
  };

  // enter motion (fade + scale + blur)
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 0);
    return () => window.clearTimeout(t);
  }, [state.idx, state.mode]);

  const motionVars: React.CSSProperties = entered
    ? ({
        ["--tp2-opacity" as any]: MOTION.enter.to.opacity,
        ["--tp2-scale" as any]: MOTION.enter.to.scale,
        ["--tp2-blur" as any]: MOTION.enter.to.blurPx,
      } as React.CSSProperties)
    : ({
        ["--tp2-opacity" as any]: MOTION.enter.from.opacity,
        ["--tp2-scale" as any]: MOTION.enter.from.scale,
        ["--tp2-blur" as any]: MOTION.enter.from.blurPx,
      } as React.CSSProperties);

  return (
    <main className="tp2-screen" style={{ ...cssVars, ...motionVars }}>
      <header className="tp2-topbar">
        <div className="tp2-topbar-inner">
          <div>
            <div className="tp2-title">설문2 · 여행 설계 보정</div>
            <div className="tp2-meta">
              Section <strong>{q.section}</strong> / F · Q <strong>{state.idx + 1}</strong> / {total}
            </div>
          </div>

          <div>
            <div className="tp2-progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="tp2-progressFill" />
            </div>
            <div className="tp2-meta">임시저장: 켜짐(로컬)</div>
          </div>

          <div>
            <button type="button" className="tp2-btn" onClick={resetDraft}>
              초기화
            </button>
          </div>
        </div>
      </header>

      <section className="tp2-wrap">
  {state.mode === "question" ? (
    <QuestionCard
      question={q}
      idx={state.idx}
      total={total}
      answers={state.answers as any}
      setAnswer={setAnswer}
      onPrev={goPrev}
      onNext={() => {
        if (state.idx === total - 1) onFinish();
        else goNext();
      }}
      canNext={canGoNext}
      validation={validation}
    />
  ) : (
    <SecondarySummaryView
  questions={filteredQuestions}
  answers={state.answers as any}
  onEdit={(qid) => {
    const idx = filteredQuestions.findIndex((x) => x.id === qid);
    
    goQuestionAt(idx >= 0 ? idx : 0);
  }}
  onBack={() => goQuestionAt(0)}
/>
  )}
</section>
    </main>
  );
}

/* ---- Minimal controls (옵션 A: 핵심만) ---- */

function QuestionCard(props: {
  question: SecondaryQuestion;
  idx: number;
  total: number;
  answers: Record<string, any>;
  setAnswer: (id: string, v: any) => void;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
  validation: { ok: boolean; msg?: string };
}) {
  const { question: q, idx, total, answers, setAnswer, onPrev, onNext, canNext,validation } = props;

  return (
    <article className="tp2-card" aria-label="question-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">
          {q.section}-{q.orderInSection} · Q{idx + 1}
        </div>
        <h2 className="tp2-h2">{q.title}</h2>
        {q.help ? <p className="tp2-body tp2-help">{q.help}</p> : null}
      </header>

      <div className="tp2-controls">
  <QuestionControl q={q} value={answers[q.id]} setAnswer={setAnswer} answers={answers} />
  {!validation.ok ? <div className="tp2-meta">{validation.msg}</div> : null}
</div>

      <footer className="tp2-footer">
        <button type="button" className="tp2-btn" onClick={onPrev} disabled={idx === 0}>
          이전
        </button>
        <button type="button" className="tp2-btnPrimary" onClick={onNext} disabled={!canNext}>
          {idx === total - 1 ? "요약 보기" : "다음"}
        </button>
      </footer>
    </article>
  );
}

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
          customMinutes={answers["b_waitingCustomMinutes"] ?? 25}
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

    case "multiChips":
      return (
        <MultiChips
          options={q.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={(next) => setAnswer(q.id, next)}
        />
      );

    case "toggle":
      return (
        <Toggle2
          left={q.options?.[0] ?? "없음"}
          right={q.options?.[1] ?? "있음"}
          value={value ?? (q.options?.[0] ?? "없음")}
          onChange={(v) => setAnswer(q.id, v)}
        />
      );

    case "rank":
      return (
        <RankList
          items={Array.isArray(value) && value.length ? value : (q.options ?? [])}
          onChange={(next) => setAnswer(q.id, next)}
        />
      );

    case "places":
      return (
        <Places
          places={Array.isArray(value) ? value : []}
          onChange={(next) => setAnswer(q.id, next)}
        />
      );

    case "textarea":
      return <TextArea value={value ?? ""} placeholder={q.placeholder ?? ""} onChange={(v) => setAnswer(q.id, v)} />;

    default:
      return <div className="tp2-meta">Unknown control</div>;
  }
}

function Segmented(props: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tp2-seg" role="group" aria-label="segmented">
      {props.options.map((opt) => {
        const active = props.value === opt;
        return (
          <button key={opt} type="button" className={active ? "tp2-btnPrimary" : "tp2-btn"} onClick={() => props.onChange(opt)}>
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
  onPreset: (p: string) => void;
  onCustom: (m: number) => void;
}) {
  const presets = ["0", "15", "30", "60", "직접"];

  return (
    <div className="tp2-controls">
      <div className="tp2-seg" role="group" aria-label="waiting-presets">
        {presets.map((p) => {
          const active = props.preset === p;
          return (
            <button key={p} type="button" className={active ? "tp2-btnPrimary" : "tp2-btn"} onClick={() => props.onPreset(p)}>
              {p}
            </button>
          );
        })}
      </div>

      {props.preset === "직접" ? (
        <div className="tp2-footer" aria-label="custom-minutes">
          <button type="button" className="tp2-btn" onClick={() => props.onCustom(Math.max(0, props.customMinutes - 5))}>
            -
          </button>
          <div className="tp2-meta">
            <strong className="tp2-h2">{props.customMinutes}</strong> 분
          </div>
          <button type="button" className="tp2-btn" onClick={() => props.onCustom(props.customMinutes + 5)}>
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
function TagInput(props: {
  tags: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
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

  const remove = (tag: string) => {
    props.onChange(props.tags.filter((x) => x !== tag));
  };

  return (
    <div className="tp2-controls">
      <div className="tp2-footer">
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

      <div className="tp2-wrapChips" aria-label="tags">
        {props.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="tp2-chip"
            onClick={() => remove(tag)}
            aria-label={`삭제: ${tag}`}
          >
            {tag}
          </button>
        ))}
        {props.tags.length === 0 ? <div className="tp2-meta">아직 없음</div> : null}
      </div>
    </div>
  );
}

function MultiChips(props: { options: string[]; value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (opt: string) => {
    const has = props.value.includes(opt);
    props.onChange(has ? props.value.filter((x) => x !== opt) : [...props.value, opt]);
  };

  return (
    <div className="tp2-wrapChips" aria-label="multi-chips">
      {props.options.map((opt) => {
        const active = props.value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            className={active ? "tp2-chipActive" : "tp2-chip"}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Toggle2(props: { left: string; right: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tp2-footer" role="group" aria-label="toggle2">
      <button
        type="button"
        className={props.value === props.left ? "tp2-chipActive" : "tp2-chip"}
        onClick={() => props.onChange(props.left)}
      >
        {props.left}
      </button>
      <button
        type="button"
        className={props.value === props.right ? "tp2-chipActive" : "tp2-chip"}
        onClick={() => props.onChange(props.right)}
      >
        {props.right}
      </button>
    </div>
  );
}

function RankList(props: { items: string[]; onChange: (next: string[]) => void }) {
  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= props.items.length) return;
    const arr = [...props.items];
    const tmp = arr[from];
    arr[from] = arr[to];
    arr[to] = tmp;
    props.onChange(arr);
  };

  return (
    <ol className="tp2-rankList" aria-label="rank-list">
      {props.items.map((item, i) => (
        <li key={item} className="tp2-rankItem">
          <div className="tp2-footer">
            <div className="tp2-body">{item}</div>
            <div className="tp2-rankBtns">
            
              <button type="button" className="tp2-btn" onClick={() => move(i, -1)} aria-label={`${item} 위로`}>
                ↑
              </button>
              <button type="button" className="tp2-btn" onClick={() => move(i, 1)} aria-label={`${item} 아래로`}>
                ↓
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

type PlaceItem = { name: string; reason: string; importance: "낮" | "중" | "높" };

function Places(props: { places: PlaceItem[]; onChange: (next: PlaceItem[]) => void }) {
  const add = () => props.onChange([...props.places, { name: "", reason: "", importance: "중" }]);

  const update = (idx: number, patch: Partial<PlaceItem>) => {
    props.onChange(props.places.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const remove = (idx: number) => props.onChange(props.places.filter((_, i) => i !== idx));

  return (
    <div className="tp2-controls">
      <button type="button" className="tp2-btn" onClick={add}>
        + 장소 카드 추가
      </button>

      {props.places.length === 0 ? <div className="tp2-meta">최소 1개는 추가해야 요약으로 넘어감</div> : null}

      {props.places.map((p, idx) => (
        <div key={idx} className="tp2-subcard" aria-label={`place-${idx}`}>
          <div className="tp2-footer">
            <div className="tp2-meta">장소 {idx + 1}</div>
            <button type="button" className="tp2-btn" onClick={() => remove(idx)}>
              삭제
            </button>
          </div>

          <input
            className="tp2-input"
            value={p.name}
            placeholder="장소명"
            onChange={(e) => update(idx, { name: e.target.value })}
          />

          <TextArea
            value={p.reason}
            placeholder="이유(한 줄~두 줄)"
            onChange={(v) => update(idx, { reason: v })}
          />

          <Segmented
            options={["낮", "중", "높"]}
            value={p.importance}
            onChange={(v) => update(idx, { importance: v as any })}
          />
        </div>
      ))}
    </div>
  );
}

function TextArea(props: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <textarea
      className="tp2-textarea"
      value={props.value}
      placeholder={props.placeholder}
      rows={4}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}
