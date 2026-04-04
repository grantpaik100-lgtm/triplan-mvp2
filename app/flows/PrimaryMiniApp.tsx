"use client";

import { useEffect, useMemo, useState } from "react";
import { primaryQuestions } from "../primary/primaryQuestions";
import {
  buildPrimaryResultPayload,
  calculateType,
} from "../primary/primaryScoring";
import PrimaryResultView from "../primary/PrimaryResultView";

import { MOTION, GLASS, SHADOW, FOCUS_RING } from "@/lib/MOTION_TOKENS";

type Props = {
  setMode: (mode: "primary" | "trip" | "assist") => void;
};

type PrimaryType = "rest" | "schedule" | "mood" | "strategy";

export default function PrimaryMiniApp({ setMode }: Props) {
  const [step, setStep] = useState<"intro" | "questions" | "calculating" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [computedType, setComputedType] = useState<PrimaryType | null>(null);
  const [gender, setGender] = useState<"m" | "f">("m");
  const [nickname, setNickname] = useState<string>("");

  const currentIndex = Object.keys(answers).length;
  const currentQuestion = primaryQuestions[currentIndex];

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
      textAlign: "center",
    };
  }, [mounted]);

  const persistPrimaryResult = (
    nextAnswers: Record<string, number>,
    nextType: PrimaryType
  ) => {
    const payload = buildPrimaryResultPayload(nextAnswers);

    const stored = {
      ...payload,
      type: nextType,
      gender,
      nickname,
      completedAt: new Date().toISOString(),
    };

    sessionStorage.setItem("triplan_primary_result", JSON.stringify(stored));
    sessionStorage.setItem("primaryResult", JSON.stringify(stored));
  };

  const handleAnswer = (value: number) => {
    if (!currentQuestion) return;

    const nextAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(nextAnswers);

    const isLast = currentIndex + 1 === primaryQuestions.length;
    if (!isLast) return;

    const t = calculateType(nextAnswers);

    persistPrimaryResult(nextAnswers, t);

    setComputedType(t);
    setStep("calculating");

    const img = new Image();
    img.src = `/images/type_${t}_${gender}.PNG`;

    window.setTimeout(() => {
      setStep("result");
    }, 500);
  };

  if (step === "intro") {
    const selectedRing = (isSelected: boolean): React.CSSProperties =>
      isSelected ? { boxShadow: FOCUS_RING.ring } : { boxShadow: "none" };

    return (
      <div className="tp-wrap">
        <div className="tp-card tp-anim-in" style={cardStyle}>
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

          <div className="tp-row">
            <button
              className="tp-chip"
              onClick={() => setGender("m")}
              style={{
                outline: "none",
                transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}`,
                ...selectedRing(gender === "m"),
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

  if (step === "questions" && currentQuestion) {
    return (
      <div className="tp-wrap">
        <div
          key={currentQuestion.id}
          className="tp-card tp-anim-in"
          style={{
            ...cardStyle,
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
              textAlign: "center",
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

  if (step === "calculating") {
    return (
      <div className="tp-wrap">
        <div className="tp-card tp-anim-in" style={cardStyle}>
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

  const type = computedType ?? calculateType(answers);

  return (
    <PrimaryResultView
      type={type}
      gender={gender}
      nickname={nickname}
      onStartTrip={() => setMode("trip")}
    />
  );
}
