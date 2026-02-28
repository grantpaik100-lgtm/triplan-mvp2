// app/secondary/SecondaryMiniApp.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { secondaryQuestions, type SecondaryQuestion } from "./secondaryQuestions";
import { secondarySchema, type SecondaryAnswers } from "./secondarySchema";
import { loadSecondaryDraft, saveSecondaryDraft, clearSecondaryDraft } from "@/src/lib/secondaryStorage";

import { MOTION, GLASS, SHADOW, COLORS, SPACE, TYPE, DENSITY, RADIUS, MAXWIDTH, Z, FOCUS_RING } from "@/src/lib/MOTION_TOKENS";
import SecondarySummaryView from "./SecondarySummaryView";

type Mode = "question" | "summary";
type State = { mode: Mode; idx: number; answers: SecondaryAnswers | Record<string, any> };

const DEFAULT_STATE: State = { mode: "question", idx: 0, answers: {} };

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
  const total = secondaryQuestions.length;

  const [state, setState] = useState<State>(DEFAULT_STATE);
  const q = secondaryQuestions[clamp(state.idx, 0, total - 1)];

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

  const cssVars = useMemo(() => toCssVars("base", progressPct), [progressPct]);

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

    const requiredOk =
      !!answers["a_rhythm"] && !!answers["a_density"] && !!answers["b_waitingPreset"] && !!answers["d_lodgingStrategy"];

    const placesOk = Array.isArray(answers["f_places"]) ? answers["f_places"].length >= 1 : false;

    if (state.idx === total - 1) return requiredOk && placesOk;

    const hardRequired = ["a_rhythm", "a_density", "b_waitingPreset", "d_lodgingStrategy", "f_places"].includes(q.id);
    if (!hardRequired) return true;

    const v = answers[q.id];
    if (q.id === "f_places") return Array.isArray(v) && v.length >= 1;
    return !!v;
  }, [q.id, state.answers, state.idx, total]);

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
          />
        ) : (
          <SecondarySummaryView
            questions={secondaryQuestions}
            answers={state.answers as any}
            onEdit={(qid) => {
              const idx = secondaryQuestions.findIndex((x) => x.id === qid);
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
}) {
  const { question: q, idx, total, answers, setAnswer, onPrev, onNext, canNext } = props;

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

    // 옵션 A에서 “보이기만” 목표면, 나머지 타입은 다음 턴에서 컨트롤별 토큰화로 확장.
    default:
      return <div className="tp2-meta">이 컨트롤은 다음 단계에서 연결</div>;
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
