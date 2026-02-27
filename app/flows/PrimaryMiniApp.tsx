"use client";

import { useState } from "react";
import { primaryQuestions } from "../primary/primaryQuestions";
import { calculateType } from "../primary/primaryScoring";
import PrimaryResultView from "../primary/PrimaryResultView";

type Props = {
  setMode: (mode: "primary" | "trip" | "assist") => void;
};

export default function PrimaryMiniApp({ setMode }: Props) {
  const [step, setStep] = useState<"intro" | "questions" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [gender, setGender] = useState<"m" | "f">("m");

  const currentIndex = Object.keys(answers).length;
  const currentQuestion = primaryQuestions[currentIndex];

  const handleAnswer = (value: number) => {
    setAnswers({ ...answers, [currentQuestion.id]: value });

    if (currentIndex + 1 === primaryQuestions.length) {
      setStep("result");
    }
  };

if (step === "intro") {
  return (
    <div className="tp-wrap">
      <div className="tp-card" style={{ textAlign: "center" }}>
        <h1 className="tp-h1">TriPlan 여행 성향 테스트</h1>
        <p className="tp-muted" style={{ marginTop: 10, marginBottom: 0 }}>
          7점 척도로 당신의 여행 감각을 빠르게 잡아냅니다.
        </p>

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

        <button className="tp-cta" onClick={() => setStep("questions")}>
          시작하기
        </button>
      </div>
    </div>
  );
}

if (step === "questions" && currentQuestion) {
  return (
    <div className="tp-wrap">
      <div className="tp-card tp-anim-in" 
        style={{ textAlign: "center" }}
        >
        <div className="tp-muted" style={{ fontSize: 13 }}>
          Q {currentIndex + 1} / {primaryQuestions.length}
        </div>

        <h2 className="tp-title">{currentQuestion.title}</h2>

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
  );
}

  const type = calculateType(answers);

  return (
    <PrimaryResultView
      type={type}
      gender={gender}
      onStartTrip={() => setMode("trip")}
    />
  );
}
