"use client";

import { useEffect, useMemo, useState } from "react";

type FollowupQuestion = {
  id: string;
  question: string;
  type: "shortText" | "single";
  options?: string[];
};

type FollowupAnswers = {
  raw: Record<string, string>;
};

type FollowupSeed = {
  source: string;
  createdAt: string;
  summary: unknown;
  rawAnswers: unknown;
};

export default function FollowupMiniApp() {
  const [seed, setSeed] = useState<FollowupSeed | null>(null);
  const [questions, setQuestions] = useState<FollowupQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [fetchingQuestions, setFetchingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // seed 로딩
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("triplan_followup_seed");

      if (!raw) {
        setError("이전 단계 데이터가 없습니다. 설문을 다시 시작해주세요.");
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(raw) as FollowupSeed;
      setSeed(parsed);
      setLoading(false);
    } catch (e) {
      console.error("seed parse error", e);
      setError("데이터를 불러오는 중 문제가 발생했습니다.");
      setLoading(false);
    }
  }, []);

  // 질문 생성 요청
  useEffect(() => {
    if (!seed) return;

    async function fetchQuestions() {
      try {
        setFetchingQuestions(true);

        const res = await fetch("/api/followup-questions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seedSummary: seed.summary,
          }),
        });

        if (!res.ok) {
          throw new Error("question fetch failed");
        }

        const data = await res.json();

        if (!data?.questions) {
          throw new Error("invalid response");
        }

        setQuestions(data.questions);
      } catch (err) {
        console.error(err);
        setError("질문을 생성하는 중 문제가 발생했습니다.");
      } finally {
        setFetchingQuestions(false);
      }
    }

    fetchQuestions();
  }, [seed]);

  // 답변 업데이트
  function updateAnswer(id: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [id]: value,
    }));
  }

  // 모든 질문 답변 여부
  const allAnswered = useMemo(() => {
    if (questions.length === 0) return false;

    return questions.every((q) => {
      const v = answers[q.id];
      return v && v.trim().length > 0;
    });
  }, [answers, questions]);
    function handleRestart() {
    window.location.href = "/";
  }

  async function handleSubmit() {
    if (!allAnswered || submitting) return;

    try {
      setSubmitting(true);

      const payload: FollowupAnswers = {
        raw: answers,
      };

      sessionStorage.setItem(
        "triplan_followup_answers",
        JSON.stringify(payload)
      );

      window.location.href = "/trip/generate";
    } catch (e) {
      console.error("followup save error", e);
      setError("답변을 저장하는 중 문제가 발생했습니다.");
      setSubmitting(false);
    }
  }

  function renderQuestion(q: FollowupQuestion, index: number) {
    const value = answers[q.id] ?? "";

    return (
      <section key={q.id} className="tp2-card" style={{ marginBottom: 16 }}>
        <div className="tp2-cardHeader">
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
              marginBottom: 6,
            }}
          >
            추가 질문 {index + 1}
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 18,
              lineHeight: 1.5,
            }}
          >
            {q.question}
          </h2>
        </div>

        <div className="tp2-controls" style={{ marginTop: 16 }}>
          {q.type === "shortText" && (
            <input
              className="tp2-input"
              type="text"
              value={value}
              placeholder="짧게 입력해주세요"
              onChange={(e) => updateAnswer(q.id, e.target.value)}
            />
          )}

          {q.type === "single" && (
            <div
              style={{
                display: "grid",
                gap: 10,
              }}
            >
              {(q.options ?? []).map((option) => {
                const selected = value === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateAnswer(q.id, option)}
                    className={selected ? "tp2-btnPrimary" : ""}
                    style={{
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: 14,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: selected ? undefined : "transparent",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
      >
        <div className="tp2-card" style={{ width: "100%", maxWidth: 720 }}>
          <div className="tp2-cardHeader">
            <h1 style={{ margin: 0, fontSize: 22 }}>데이터 불러오는 중</h1>
            <p style={{ marginTop: 10, opacity: 0.72 }}>
              이전 설문 정보를 확인하고 있습니다.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error && !seed) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
      >
        <div className="tp2-card" style={{ width: "100%", maxWidth: 720 }}>
          <div className="tp2-cardHeader">
            <h1 style={{ margin: 0, fontSize: 22 }}>진행 정보를 찾을 수 없음</h1>
            <p style={{ marginTop: 10, opacity: 0.72 }}>{error}</p>
          </div>

          <div className="tp2-footer" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="tp2-btnPrimary"
              onClick={handleRestart}
            >
              처음으로 이동
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px 40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <section className="tp2-card" style={{ marginBottom: 16 }}>
          <div className="tp2-cardHeader">
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Follow-up
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 24,
                lineHeight: 1.35,
              }}
            >
              일정 생성을 위해 몇 가지만 더 확인할게요
            </h1>

            <p
              style={{
                marginTop: 12,
                opacity: 0.76,
                lineHeight: 1.6,
              }}
            >
              이전 설문을 바탕으로, 실제 일정 설계에 중요한 부분만 짧게
              보강합니다. 1~2분 안에 끝납니다.
            </p>
          </div>
        </section>

        {fetchingQuestions && (
          <section className="tp2-card" style={{ marginBottom: 16 }}>
            <div className="tp2-cardHeader">
              <h2 style={{ margin: 0, fontSize: 18 }}>질문 생성 중</h2>
              <p style={{ marginTop: 10, opacity: 0.72 }}>
                이전 답변을 바탕으로 필요한 질문만 추리고 있습니다.
              </p>
            </div>
          </section>
        )}

        {!fetchingQuestions && questions.map((q, index) => renderQuestion(q, index))}

        {error && seed && (
          <section className="tp2-card" style={{ marginBottom: 16 }}>
            <div className="tp2-cardHeader">
              <p
                style={{
                  margin: 0,
                  color: "#b42318",
                  lineHeight: 1.6,
                }}
              >
                {error}
              </p>
            </div>
          </section>
        )}

        <section className="tp2-card">
          <div className="tp2-footer">
            <button
              type="button"
              className="tp2-btnPrimary"
              onClick={handleSubmit}
              disabled={!allAnswered || submitting || fetchingQuestions}
              style={{
                width: "100%",
                opacity:
                  !allAnswered || submitting || fetchingQuestions ? 0.6 : 1,
                cursor:
                  !allAnswered || submitting || fetchingQuestions
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {submitting ? "저장 중..." : "답변 완료하고 일정 생성으로 이동"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
