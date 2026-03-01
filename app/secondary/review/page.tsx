"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "../secondary.css";

import { loadSecondaryDraft } from "@/lib/secondaryStorage";
import { MOTION, GLASS, SHADOW, COLORS, SPACE, TYPE, DENSITY, RADIUS, MAXWIDTH, FOCUS_RING } from "@/lib/MOTION_TOKENS";

function toCssVars() {
  const d = DENSITY.dense;
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
  } as React.CSSProperties;
}

type Msg = { role: "user" | "assistant"; text: string };

export default function SecondaryReviewPage() {
  const router = useRouter();
  const cssVars = useMemo(() => toCssVars(), []);

  const draft = useMemo(() => loadSecondaryDraft(), []);
  const answers = (draft?.answers ?? {}) as Record<string, any>;

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      text: "설정값을 검토한다. 트레이드오프/리스크만 짧게 정리하고, 필요한 경우에만 추가 질문을 한다.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const t = input.trim();
    if (!t || busy) return;

    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/secondary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: t,
          answers,
          history: msgs,
        }),
      });

      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "request_failed");

      setMsgs((m) => [...m, { role: "assistant", text: data.text || "응답 없음" }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "검토 요청에 실패했다. 키/서버 설정을 확인." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="tp2-screen" style={cssVars}>
      <div className="tp2-wrap">
        <article className="tp2-card" aria-label="review-card">
          <header className="tp2-cardHeader">
            <div className="tp2-meta">검토 단계</div>
            <h2 className="tp2-h2">설정 해석(보조)</h2>
            <p className="tp2-body tp2-help">설정값을 기반으로 일정 설계에 영향을 주는 포인트만 말한다.</p>
          </header>

          <div className="tp2-controls">
            <div className="tp2-subcard">
              <div className="tp2-meta">현재 설정 스냅샷</div>
              <pre className="tp2-meta" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{JSON.stringify(answers, null, 2)}
              </pre>
            </div>

            <div className="tp2-subcard">
              <div className="tp2-meta">대화</div>
              <div style={{ display: "grid", gap: "calc(var(--tp2-space-10) * 1px)" }}>
                {msgs.map((m, i) => (
                  <div key={i} className="tp2-subcard">
                    <div className="tp2-meta">{m.role === "user" ? "나" : "보조"}</div>
                    <div className="tp2-body">{m.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="tp2-subcard">
              <div className="tp2-row">
                <input
                  className="tp2-input"
                  value={input}
                  placeholder="검토 질문 입력(예: 일정 밀도 더 느슨하게 하면 뭐가 바뀜?)"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="button" className="tp2-btnPrimary" onClick={send} disabled={busy}>
                  {busy ? "요청중" : "보내기"}
                </button>
              </div>
            </div>
          </div>

          <footer className="tp2-footer">
            <button type="button" className="tp2-btn" onClick={() => router.push("/secondary")}>
              설정으로
            </button>
            <button type="button" className="tp2-btnPrimary" onClick={() => router.push("/flows")}>
              일정 생성으로
            </button>
          </footer>
        </article>
      </div>
    </main>
  );
}  } as React.CSSProperties;
}

function interpret(answers: Record<string, any>) {
  const notes: string[] = [];

  // examples (컨설턴트 톤의 뼈대만)
  if (answers?.a_density) notes.push(`일정 밀도 설정: ${answers.a_density}`);
  if (answers?.b_allergyTags?.length) notes.push(`음식 리스크: 알레르기/회피 ${answers.b_allergyTags.length}개`);
  if (answers?.c_walkLimit) notes.push(`도보 제약: ${answers.c_walkLimit}`);
  if (answers?.d_lodgingPriority?.length) notes.push(`숙소 우선순위: ${answers.d_lodgingPriority.join(" > ")}`);
  if (answers?.f_places?.length) notes.push(`핵심 장소: ${answers.f_places.length}개`);

  if (notes.length === 0) notes.push("설정값을 찾지 못했다. 설문2로 돌아가서 입력을 확인.");

  return notes;
}

export default function SecondaryReviewPage() {
  const router = useRouter();
  const draft = useMemo(() => loadSecondaryDraft(), []);
  const answers = (draft?.answers ?? {}) as Record<string, any>;
  const notes = useMemo(() => interpret(answers), [answers]);
  const cssVars = useMemo(() => toCssVars(), []);

  return (
    <main className="tp2-screen" style={cssVars}>
      <div className="tp2-wrap">
        <article className="tp2-card" aria-label="review-card">
          <header className="tp2-cardHeader">
            <div className="tp2-meta">검토 단계</div>
            <h2 className="tp2-h2">설정 해석</h2>
            <p className="tp2-body tp2-help">입력값이 일정 설계에 어떤 영향을 주는지 정리한다.</p>
          </header>

          <div className="tp2-controls">
            {notes.map((t, i) => (
              <div key={i} className="tp2-subcard">
                <div className="tp2-body">{t}</div>
              </div>
            ))}
          </div>

          <footer className="tp2-footer">
            <button type="button" className="tp2-btn" onClick={() => router.push("/secondary")}>
              설정으로 돌아가기
            </button>
            <button type="button" className="tp2-btnPrimary" onClick={() => router.push("/flows")}>
              일정 생성으로
            </button>
          </footer>
        </article>
      </div>
    </main>
  );
}
