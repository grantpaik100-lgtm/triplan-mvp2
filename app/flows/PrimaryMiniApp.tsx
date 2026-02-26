"use client";

import { useState } from "react";
import { primaryQuestions } from "@/primary/primaryQuestions";
import { calculateType } from "@/primary/primaryScoring";
import PrimaryResultView from "@/primary/PrimaryResultView";

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
      <div style={{ textAlign: "center", padding: 40 }}>
        <h1>TriPlan 여행 성향 테스트</h1>
        <div style={{ marginTop: 20 }}>
          <button onClick={() => setGender("m")}>남성</button>
          <button onClick={() => setGender("f")} style={{ marginLeft: 12 }}>
            여성
          </button>
        </div>
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setStep("questions")}>시작하기</button>
        </div>
      </div>
    );
  }

  if (step === "questions" && currentQuestion) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <h2>{currentQuestion.title}</h2>
        <div style={{ marginTop: 20 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              onClick={() => handleAnswer(n)}
              style={{ margin: 4 }}
            >
              {n}
            </button>
          ))}
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
