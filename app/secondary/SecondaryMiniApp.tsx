"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "./secondary.css";

import { secondaryQuestions, type SecondaryQuestion } from "./secondaryQuestions";
import { secondarySchema, type SecondaryAnswers } from "./secondarySchema";
import { loadSecondaryDraft, saveSecondaryDraft, clearSecondaryDraft } from "@/lib/secondaryStorage";
import { MOTION, GLASS, SHADOW, COLORS, SPACE, TYPE, DENSITY, RADIUS, MAXWIDTH, Z, FOCUS_RING } from "@/lib/MOTION_TOKENS";
import SecondarySummaryView from "./SecondarySummaryView";

type Mode = "question" | "summary";

type State = {
  mode: Mode;
  idx: number;
  answers: Partial<SecondaryAnswers> & Record<string, any>;
};

const DEFAULT_STATE: State = {
  mode: "question",
  idx: 0,
  answers: {},
};

type Section = "A" | "B" | "C" | "D" | "E" | "F";

const SECTION_LABEL: Record<Section, string> = {
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

function toCssVars(densityKey: keyof typeof DENSITY, progressPct: number) {
  const d = DENSITY[densityKey];
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

    // layout
    ["--tp2-space-6" as any]: SPACE[6],
    ["--tp2-space-8" as any]: SPACE[8],
    ["--tp2-space-10" as any]: SPACE[10],
    ["--tp2-space-12" as any]: SPACE[12],
    ["--tp2-space-14" as any]: SPACE[14],
    ["--tp2-space-16" as any]: SPACE[16],
    ["--tp2-space-20" as any]: SPACE[20],
    ["--tp2-space-24" as any]: SPACE[24],

    ["--tp2-radius-pill" as any]: RADIUS.pill,
    ["--tp2-radius-lg" as any]: RADIUS.lg,
    ["--tp2-radius-xl" as any]: RADIUS.xl,

    // typography
    ["--tp2-h2-size" as any]: TYPE.h2.size,
    ["--tp2-h2-lh" as any]: TYPE.h2.lineHeight,
    ["--tp2-h2-w" as any]: TYPE.h2.weight,
    ["--tp2-body-size" as any]: TYPE.body.size,
    ["--tp2-body-lh" as any]: TYPE.body.lineHeight,
    ["--tp2-body-w" as any]: TYPE.body.weight,
    ["--tp2-caption-size" as any]: TYPE.caption.size,
    ["--tp2-caption-lh" as any]: TYPE.caption.lineHeight,
    ["--tp2-caption-w" as any]: TYPE.caption.weight,

    // density
    ["--tp2-pad-x" as any]: d.cardPadX,
    ["--tp2-pad-y" as any]: d.cardPadY,
    ["--tp2-rowgap" as any]: d.rowGap,
    ["--tp2-btn-h" as any]: d.buttonHeight,
    ["--tp2-chip-h" as any]: d.chipHeight,

    // bigger card like survey1
    ["--tp2-maxw" as any]: MAXWIDTH.chat,

    // progress if needed later
    ["--tp2-progress" as any]: progressPct,
  } as React.CSSProperties;
}

function getGroupLabels() {
  const groupQ = secondaryQuestions.find((x) => x.id === "e_groupMode");
  return {
    SOLO: (groupQ?.options?.[0] as string) ?? "혼자",
    GROUP: (groupQ?.options?.[1] as string) ?? "여럿",
  };
}

function getRequiredIds(answers: Record<string, any>) {
  const { SOLO, GROUP } = getGroupLabels();
  const groupMode = answers?.e_groupMode ?? SOLO;

  const base = ["a_rhythm", "a_density", "b_waitingPreset", "d_lodgingStrategy", "f_places", "f_placeReasonOneLine"];
  if (groupMode === GROUP) base.push("e_conflictRule");
  return new Set(base);
}

function validateQuestion(q: SecondaryQuestion, answers: Record<string, any>): { ok: boolean; msg?: string } {
  const required = getRequiredIds(answers).has(q.id);
  const v = answers[q.id];

  if (!required) return { ok: true };

  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return { ok: false, msg: "필수 항목" };

  if (q.id === "b_waitingPreset") {
    if (v === "직접") {
      const m = answers["b_waitingCustomMinutes"];
      if (m == null || Number.isNaN(Number(m))) return { ok: false, msg: "직접 입력 분을 설정" };
    }
  }

  if (q.id === "f_places") {
    if (!Array.isArray(v) || v.length < 1) return { ok: false, msg: "장소를 최소 1개 추가" };
    for (const p of v) {
      if (!p?.name?.trim()) return { ok: false, msg: "장소명 입력" };
      if (!p?.reason?.trim()) return { ok: false, msg: "장소 이유 입력" };
      if (!p?.importance) return { ok: false, msg: "중요도 선택" };
    }
  }

  if (q.type === "textarea") {
    if (!String(v).trim()) return { ok: false, msg: "내용 입력" };
  }

  return { ok: true };
}

export default function SecondaryMiniApp() {
  const [state, setState] = useState<State>(DEFAULT_STATE);

  // load draft once
  useEffect(() => {
    const draft = loadSecondaryDraft();
    if (draft?.answers) {
      setState((s) => ({ ...s, answers: draft.answers, idx: draft.idx ?? 0, mode: draft.mode ?? "question" }));
    }
  }, []);

  // debounce save to avoid lag
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveSecondaryDraft(state);
    }, MOTION.duration.base);
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

  // keep idx valid when filtered length changes
  useEffect(() => {
    const max = Math.max(0, filteredQuestions.length - 1);
    if (state.idx <= max) return;
    setState((s) => ({ ...s, idx: max }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuestions.length]);

  const total = filteredQuestions.length;
  const q = (total > 0 ? filteredQuestions[clamp(state.idx, 0, total - 1)] : secondaryQuestions[0])!;

  const progressPct = useMemo(() => {
    if (total <= 1) return 0;
    return Math.round((clamp(state.idx, 0, total - 1) / (total - 1)) * 100);
  }, [state.idx, total]);

  const cssVars = useMemo(() => toCssVars("base", progressPct), [progressPct]);

  const setAnswer = (id: string, value: any) => {
    setState((s) => ({ ...s, answers: { ...(s.answers as any), [id]: value } }));
  };

  const goPrev = () => setState((s) => ({ ...s, idx: clamp(s.idx - 1, 0, Math.max(0, total - 1)), mode: "question" }));
  const goQuestionAt = (idx: number) => setState((s) => ({ ...s, idx: clamp(idx, 0, Math.max(0, total - 1)), mode: "question" }));
  const goNext = () => setState((s) => ({ ...s, idx: clamp(s.idx + 1, 0, Math.max(0, total - 1)), mode: "question" }));

  const onFinish = () => setState((s) => ({ ...s, mode: "summary" }));

  const canGoNext = useMemo(() => validateQuestion(q, state.answers as any).ok, [q, state.answers]);
  const validation = useMemo(() => validateQuestion(q, state.answers as any), [q, state.answers]);

  const sectionLabel = SECTION_LABEL[q.section as Section] ?? `${q.section}`;

  if (state.mode === "summary") {
    return (
      <main className="tp2-screen" style={cssVars}>
        <div className="tp2-wrap">
          <SecondarySummaryView
            questions={filteredQuestions}
            answers={state.answers as any}
            onEdit={(qid) => {
              const idx = filteredQuestions.findIndex((x) => x.id === qid);
              goQuestionAt(idx >= 0 ? idx : 0);
            }}
            onBack={() => goQuestionAt(0)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="tp2-screen" style={cssVars}>
      <div className="tp2-wrap">
        <QuestionCard
          question={q}
          idx={state.idx}
          total={total}
          answers={state.answers as any}
          sectionLabel={sectionLabel}
          setAnswer={setAnswer}
          onPrev={goPrev}
          onNext={() => {
            if (state.idx === total - 1) onFinish();
            else goNext();
          }}
          canNext={canGoNext}
          validation={validation}
        />
      </div>
    </main>
  );
}

function QuestionCard(props: {
  question: SecondaryQuestion;
  idx: number;
  total: number;
  answers: Record<string, any>;
  sectionLabel: string;
  setAnswer: (id: string, v: any) => void;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
  validation: { ok: boolean; msg?: string };
}) {
  const { question: q, idx, total, answers, sectionLabel, setAnswer, onPrev, onNext, canNext, validation } = props;

  return (
    <article className="tp2-card" aria-label="question-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">
          {q.section} · {sectionLabel} · Q{idx + 1} / {total}
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

/* ---------------- Controls ---------------- */

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
      return <MultiChips options={q.options ?? []} value={Array.isArray(value) ? value : []} onChange={(n) => setAnswer(q.id, n)} />;

    case "toggle":
      return <Toggle2 left={q.options?.[0] ?? "없음"} right={q.options?.[1] ?? "있음"} value={value ?? (q.options?.[0] ?? "없음")} onChange={(v) => setAnswer(q.id, v)} />;

    case "rank":
      return <DragRankList items={Array.isArray(value) && value.length ? value : q.options ?? []} onChange={(n) => setAnswer(q.id, n)} />;

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
    <div className="tp2-seg" aria-label="segmented">
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
  onPreset: (p: string) => void;
  onCustom: (m: number) => void;
}) {
  const isCustom = props.preset === "직접";
  return (
    <div className="tp2-controls">
      <Segmented options={["짧게", "보통", "여유", "직접"]} value={props.preset} onChange={props.onPreset} />
      {isCustom ? (
        <div className="tp2-rankRow">
          <input
            className="tp2-input"
            value={String(props.customMinutes ?? 25)}
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
    <div className="tp2-controls">
      <div className="tp2-rankRow">
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
          <button key={tag} type="button" className="tp2-chip" onClick={() => remove(tag)} aria-label={`삭제: ${tag}`}>
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
          <button key={opt} type="button" className={active ? "tp2-chipActive" : "tp2-chip"} onClick={() => toggle(opt)}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Toggle2(props: { left: string; right: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tp2-rankRow" role="group" aria-label="toggle2">
      <button type="button" className={props.value === props.left ? "tp2-chipActive" : "tp2-chip"} onClick={() => props.onChange(props.left)}>
        {props.left}
      </button>
      <button type="button" className={props.value === props.right ? "tp2-chipActive" : "tp2-chip"} onClick={() => props.onChange(props.right)}>
        {props.right}
      </button>
    </div>
  );
}

/* Drag Rank List (D-2) */
function DragRankList(props: { items: string[]; onChange: (next: string[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const onDragStart = (i: number) => setDragIdx(i);

  const onDrop = (to: number) => {
    if (dragIdx == null || dragIdx === to) return;
    const arr = [...props.items];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(to, 0, moved);
    setDragIdx(null);
    props.onChange(arr);
  };

  return (
    <div className="tp2-rankHint">
      <div className="tp2-meta">위에서부터 1~5순위. 오른쪽 ‘끌기’로 순서를 바꿔.</div>
      <ol className="tp2-rankList" aria-label="rank-list">
        {props.items.map((item, i) => (
          <li
            key={`${item}-${i}`}
            className="tp2-rankItem"
            draggable
            onDragStart={() => onDragStart(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
          >
            <div className="tp2-rankRow">
              <div className="tp2-rankLeft">
                <div className="tp2-rankBadge">{i + 1}순위</div>
                <div className="tp2-body">{item}</div>
              </div>
              <div className="tp2-rankHandle" aria-label="drag-handle">
                끌기
              </div>
            </div>
          </li>
        ))}
      </ol>
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
    // No API. Open a search page.
    const naver = `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
    window.open(naver, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="tp2-controls">
      <button type="button" className="tp2-btn" onClick={add}>
        + 장소 카드 추가
      </button>

      {props.places.length === 0 ? <div className="tp2-meta">최소 1개는 추가해야 요약으로 넘어감</div> : null}

      {props.places.map((p, idx) => (
        <div key={idx} className="tp2-subcard" aria-label={`place-${idx}`}>
          <div className="tp2-rankRow">
            <div className="tp2-meta">장소 {idx + 1}</div>
            <button type="button" className="tp2-btn" onClick={() => remove(idx)}>
              삭제
            </button>
          </div>

          <div className="tp2-rankRow">
            <input className="tp2-input" value={p.name} placeholder="장소명" onChange={(e) => update(idx, { name: e.target.value })} />
            <button type="button" className="tp2-btn" onClick={() => openMapSearch(p.name)}>
              지도에서 찾기
            </button>
          </div>

          <TextArea value={p.reason} placeholder="이유(한 줄~두 줄)" onChange={(v) => update(idx, { reason: v })} />

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
