"use client";

import { useEffect, useMemo, useState } from "react";
import { primaryQuestions } from "./primaryQuestions";
import { calculateType } from "./primaryScoring";
import PrimaryResultView from "./PrimaryResultView";

import { MOTION, GLASS, SHADOW, FOCUS_RING } from "@/lib/MOTION_TOKENS";

type Props = {
  setMode: (mode: "primary" | "trip" | "assist") => void;
};

export default function PrimaryMiniApp({ setMode }: Props) {
  const [step, setStep] = useState<"intro" | "questions" | "calculating" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [computedType, setComputedType] = useState<"rest" | "schedule" | "mood" | "strategy" | null>(null);
  const [gender, setGender] = useState<"m" | "f">("m");
  const [nickname, setNickname] = useState<string>("");

  const currentIndex = Object.keys(answers).length;
  const currentQuestion = primaryQuestions[currentIndex];

  // ✅ 토큰 기반 enter 애니메이션 (step/문항 변경마다 트리거)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(false);
    const t = window.setTimeout(() => setMounted(true), 10);
    return () => window.clearTimeout(t);
  }, [step, currentQuestion?.id]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    const d = MOTION.duration.base;
    const e = MOTION.easing;
    return {
      background: GLASS.background,
      border: GLASS.border,
      backdropFilter: `blur(${GLASS.backdropBlurPx}px)`,
      boxShadow: SHADOW.level3,
      transition: `opacity ${d}ms ${e}, transform ${d}ms ${e}, filter ${d}ms ${e}`,
      opacity: mounted ? MOTION.enter.to.opacity : MOTION.enter.from.opacity,
      transform: mounted ? `scale(${MOTION.enter.to.scale})` : `scale(${MOTION.enter.from.scale})`,
      filter: mounted ? `blur(${MOTION.enter.to.blurPx}px)` : `blur(${MOTION.enter.from.blurPx}px)`,
      willChange: "opacity, transform, filter",
    };
  }, [mounted]);

  const handleAnswer = (value: number) => {
    if (!currentQuestion) return;

    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(nextAnswers);

    const isLast = currentIndex + 1 === primaryQuestions.length;
    if (!isLast) return;

    // ✅ 마지막: 즉시 타입 계산 + 이미지 프리로드 + calculating 화면
    const t = calculateType(nextAnswers);
    setComputedType(t);
    setStep("calculating");

    const img = new Image();
    img.src = `/images/type_${t}_${gender}.PNG`;

    window.setTimeout(() => {
      setStep("result");
    }, 500);
  };

  // --- INTRO ---
  if (step === "intro") {
    const selectedRing = (isSelected: boolean): React.CSSProperties =>
      isSelected ? { boxShadow: FOCUS_RING.ring } : { boxShadow: "none" };

    return (
      <div className="tp-wrap">
        <div className="tp-card tp-anim-in" style={{ ...cardStyle, textAlign: "center" }}>
          <img
            src="/images/type_schedule_m.PNG"
            alt="스케줄 메이커"
            className="tp-result-img"
            style={{ width: "76%", maxWidth: 320 }}
          />

          <h1 className="tp-h1" style={{ marginTop: 8 }}>
            TriPlan 여행 성향 테스트
          </h1>

          <p className="tp-muted" style={{ marginTop: 10, marginBottom: 0 }}>
            7점 척도로 당신의 여행 감각을 빠르게 잡아냅니다.
          </p>

          {/* ✅ 닉네임 입력: 토큰 기반 border + focus ring */}
          <div style={{ marginTop: 16 }}>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임 (예: 현승)"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 14,
                border: GLASS.border,
                background: "rgba(255,255,255,0.90)",
                fontWeight: 700,
                outline: "none",
                transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}`,
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = FOCUS_RING.ring;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* ✅ 성별 선택: outline 금지, ring 사용 */}
          <div className="tp-row">
            <button
              className="tp-chip"
              onClick={() => setGender("m")}
              style={{
                outline: "none",
                transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}`,
                ...selectedRing(gender === "m"),
              }}
              onFocus={(e) => {
                if (gender !== "m") e.currentTarget.style.boxShadow = FOCUS_RING.ring;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = gender === "m" ? FOCUS_RING.ring : "none";
              }}
            >
              남성
            </button>

            <button
              className="tp-chip"
              onClick={() => setGender("f")}
              style={{
                outline: "none",
                transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}`,
                ...selectedRing(gender === "f"),
              }}
              onFocus={(e) => {
                if (gender !== "f") e.currentTarget.style.boxShadow = FOCUS_RING.ring;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = gender === "f" ? FOCUS_RING.ring : "none";
              }}
            >
              여성
            </button>
          </div>

          <button
            className="tp-cta"
            onClick={() => setStep("questions")}
            disabled={!nickname.trim()}
            style={{
              opacity: nickname.trim() ? 1 : 0.55,
              outline: "none",
              transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}, transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = FOCUS_RING.ring;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            시작하기
          </button>
        </div>
      </div>
    );
  }

  // --- QUESTIONS ---
  if (step === "questions" && currentQuestion) {
    return (
      <div className="tp-wrap">
        <div
          key={currentQuestion.id}
          className="tp-card tp-anim-in"
          style={{
            ...cardStyle,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="tp-muted" style={{ fontSize: 13 }}>
            Q {currentIndex + 1} / {primaryQuestions.length}
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <h2 className="tp-title" style={{ marginTop: 0 }}>
              {currentQuestion.title}
            </h2>

            <div className="tp-scale" style={{ marginTop: 26 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => handleAnswer(n)}
                  style={{
                    outline: "none",
                    transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}, transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = FOCUS_RING.ring;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {n}
                </button>
              ))}
            </div>

            <div
              className="tp-muted"
              style={{
                marginTop: 16,
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                opacity: 0.9,
              }}
            >
              <span>전혀 아니다</span>
              <span>매우 그렇다</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- CALCULATING ---
  if (step === "calculating") {
    return (
      <div className="tp-wrap">
        <div className="tp-card tp-anim-in" style={{ ...cardStyle, textAlign: "center" }}>
          <div className="tp-muted" style={{ fontSize: 13 }}>
            결과를 계산 중
          </div>
          <div className="tp-spinner" />
          <div className="tp-muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.6 }}>
            잠깐만. 지금 여행 성향을 정리하고 있어.
          </div>
        </div>
      </div>
    );
  }

  // --- RESULT ---
  const type = computedType ?? calculateType(answers);

  return (
    <PrimaryResultView type={type} gender={gender} nickname={nickname} onStartTrip={() => setMode("trip")} />
  );
}
