"use client";

import { useState } from "react";
import { primaryQuestions } from "../primary/primaryQuestions";
import { calculateType } from "../primary/primaryScoring";
import PrimaryResultView from "../primary/PrimaryResultView";

type Props = {
  setMode: (mode: "primary" | "trip" | "assist") => void;
};

export default function PrimaryMiniApp({ setMode }: Props) {
  const [step, setStep] = useState<"intro" | "questions" | "calculating" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [computedType, setComputedType] = useState<"rest" | "schedule" | "mood" | "strategy" | null>(null);
  const [gender, setGender] = useState<"m" | "f">("m");
  const [nickname, setNickname] = useState<string>(""); // ✅ 추가

  const currentIndex = Object.keys(answers).length;
  const currentQuestion = primaryQuestions[currentIndex];

  const handleAnswer = (value: number) => {
  const nextAnswers = { ...answers, [currentQuestion.id]: value };
  setAnswers(nextAnswers);

  const isLast = currentIndex + 1 === primaryQuestions.length;
  if (!isLast) return;

  // ✅ 마지막: 즉시 타입 계산 + 이미지 프리로드 + calculating 화면
  const t = calculateType(nextAnswers);
  setComputedType(t);
  setStep("calculating");

  // 이미지 프리로드
  const img = new Image();
  img.src = `/images/type_${t}_${gender}.PNG`;

  // v1처럼 "계산중" 잠깐 보여주고 결과로
  window.setTimeout(() => {
    setStep("result");
  }, 500);
};

if (step === "intro") {
  return (
    <div className="tp-wrap">
      <div className="tp-card tp-anim-in" style={{ textAlign: "center" }}>
        {/* ✅ v1처럼 첫 화면 대표 이미지 */}
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

        {/* ✅ 닉네임 입력 */}
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
              border: "1px solid var(--card-border)",
              background: "rgba(255,255,255,0.9)",
              fontWeight: 700,
              outline: "none",
            }}
          />
        </div>

        <div className="tp-row">
          <button
            className="tp-chip"
            onClick={() => setGender("m")}
            style={{
              outline: gender === "m" ? "2px solid rgba(63,167,255,0.6)" : "none",
            }}
          >
            남성
          </button>
          <button
            className="tp-chip"
            onClick={() => setGender("f")}
            style={{
              outline: gender === "f" ? "2px solid rgba(63,167,255,0.6)" : "none",
            }}
          >
            여성
          </button>
        </div>

        <button
          className="tp-cta"
          onClick={() => setStep("questions")}
          disabled={!nickname.trim()}
          style={{ opacity: nickname.trim() ? 1 : 0.55 }}
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
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 상단 진행도 */}
        <div className="tp-muted" style={{ fontSize: 13 }}>
          Q {currentIndex + 1} / {primaryQuestions.length}
        </div>

        {/* ✅ 가운데로 내려오는 질문 영역 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h2 className="tp-title" style={{ marginTop: 0 }}>
            {currentQuestion.title}
          </h2>
        </div>

        {/* ✅ 하단 선택 영역 */}
        <div>
          <div className="tp-scale">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} onClick={() => handleAnswer(n)}>
                {n}
              </button>
            ))}
          </div>

          <div
            className="tp-muted"
            style={{
              marginTop: 18,
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
      <div className="tp-card tp-anim-in" style={{ textAlign: "center" }}>
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
