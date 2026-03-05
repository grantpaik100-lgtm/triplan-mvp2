"use client";

import { useMemo, useState } from "react";
import "../secondary.css";
import { loadSecondaryDraft } from "@/lib/secondaryStorage";
import { MOTION, GLASS, SHADOW, COLORS, SPACE, TYPE, DENSITY, RADIUS, MAXWIDTH, FOCUS_RING } from "@/lib/MOTION_TOKENS";

function toCssVars() {
  const d = DENSITY.dense;
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

type Msg = { role: "user" | "assistant"; text: string };

function interpret(answers: Record<string, any>) {
  const lines: string[] = [];

  const nights = answers.g_tripNights;
  const days = answers.g_tripDays;
  if (nights != null && days != null) lines.push(`기간: ${nights}박 ${days}일`);

  if (answers.a_density) lines.push(`일정 밀도: ${answers.a_density}`);
  if (answers.b_waitingPreset) lines.push(`대기 상한: ${answers.b_waitingPreset}${answers.b_waitingPreset === "직접" ? `(${answers.b_waitingCustomMinutes}분)` : ""}`);
  if (answers.c_walkCap) lines.push(`도보 허용: ${answers.c_walkCap}`);
  if (answers.d_lodgingStrategy) lines.push(`숙소 전략: ${answers.d_lodgingStrategy}`);

  const risk = [];
  if (Array.isArray(answers.b_allergyTags) && answers.b_allergyTags.length) risk.push(`알레르기=${answers.b_allergyTags.join(", ")}`);
  if (Array.isArray(answers.b_avoidTags) && answers.b_avoidTags.length) risk.push(`회피=${answers.b_avoidTags.join(", ")}`);
  if (risk.length) lines.push(`음식 리스크: ${risk.join(" / ")}`);

  // 간단 트레이드오프 문장
  const t: string[] = [];
  if (answers.a_density === "빡빡") t.push("밀도가 높으면 이동/대기 제약이 강하게 작동한다.");
  if (answers.c_walkCap === "짧게") t.push("도보 제한이 강하면 대중교통/택시 비중이 올라간다.");
  if (answers.b_waitingPreset?.includes("짧게")) t.push("대기 상한이 낮으면 인기 맛집 후보가 크게 줄어든다.");
  if (t.length) lines.push(`트레이드오프: ${t.join(" ")}`);

  return lines.length ? lines.join("\n") : "설정값이 충분하지 않다.";
}

export default function SecondaryReviewPage() {
  const cssVars = useMemo(() => toCssVars(), []);
  const draft = useMemo(() => loadSecondaryDraft(), []);
  const answers = (draft?.answers ?? {}) as Record<string, any>;

  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "설정값을 검토한다. 아래는 요약/트레이드오프다.\n\n" + interpret(answers) },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);

    // 지금은 규칙 기반. (나중에 LLM API로 교체)
    const reply = `요청: ${t}\n\n현재 설정 기반으로 반영하면, 후보 필터/동선/밀도에서 영향이 발생한다. 필요한 경우 ‘대기 상한’과 ‘도보 허용’을 먼저 조정한다.`;
    setMsgs((m) => [...m, { role: "assistant", text: reply }]);
    setInput("");
  };

  return (
    <main className="tp2-screen" style={cssVars}>
      <div className="tp2-wrap">
        <article className="tp2-card">
          <header className="tp2-cardHeader">
            <div className="tp2-meta">검토 단계</div>
            <h2 className="tp2-h2">설정 해석</h2>
            <p className="tp2-body tp2-help">설정값이 일정 생성에 미치는 영향만 정리한다.</p>
          </header>

          <div className="tp2-controls tp2-controlsScrollable">
            {msgs.map((m, i) => (
              <div key={i} className="tp2-subcard">
                <div className="tp2-meta">{m.role === "user" ? "나" : "보조"}</div>
                <div className="tp2-body" style={{ whiteSpace: "pre-wrap" }}>
                  {m.text}
                </div>
              </div>
            ))}

            <div className="tp2-row">
              <input className="tp2-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="질문 입력" />
              <button className="tp2-btnPrimary" onClick={send}>
                보내기
              </button>
            </div>
          </div>

          <footer className="tp2-footer">
            <button className="tp2-btn" onClick={() => (window.location.href = "/secondary")}>
              설정으로
            </button>
          </footer>
        </article>
      </div>
    </main>
  );
}
