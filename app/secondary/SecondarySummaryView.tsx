"use client";

import type { SecondaryAnswers } from "./secondarySchema";
import type { SecondaryQuestion } from "./secondaryQuestions";

type Section = "A" | "B" | "C" | "D" | "E" | "F";

const SECTION_LABEL: Record<Section, string> = {
  A: "시간대 · 리듬",
  B: "음식 리스크",
  C: "이동 제약",
  D: "숙소 전략",
  E: "동행 조율",
  F: "핵심 장소 · 이유",
};

function groupBySection(questions: SecondaryQuestion[]) {
  const map = new Map<Section, SecondaryQuestion[]>();
  for (const q of questions) {
    const sec = q.section as Section;
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(q);
  }
  const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return entries;
}

function formatAnswer(q: SecondaryQuestion, answers: Record<string, any>) {
  const v = answers[q.id];
  if (v == null) return "—";
  if (Array.isArray(v)) {
    if (q.type === "places") return `${v.length}개`;
    return v.length ? v.join(", ") : "—";
  }
  if (typeof v === "object") return "—";
  return String(v);
}

export default function SecondarySummaryView(props: {
  questions: SecondaryQuestion[];
  answers: SecondaryAnswers | Record<string, any>;
  onEdit: (qid: string) => void;
  onBack: () => void;
}) {
  const { questions, answers, onEdit, onBack } = props;
  const sections = groupBySection(questions);

  return (
    <article className="tp2-card" aria-label="summary-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">요약</div>
        <h2 className="tp2-h2">내 여행 설계 보정</h2>
        <p className="tp2-body tp2-help">필요한 섹션만 수정하고 완료하면 된다.</p>
      </header>

      <div className="tp2-controls">
        {sections.map(([sec, qs]) => (
          <div key={sec} className="tp2-subcard" aria-label={`summary-section-${sec}`}>
            <div className="tp2-rankRow">
              <div className="tp2-rankLeft">
                <div className="tp2-rankBadge">{sec}</div>
                <div className="tp2-body">{SECTION_LABEL[sec]}</div>
              </div>

              <button type="button" className="tp2-btn" onClick={() => onEdit(qs[0]?.id ?? "")}>
                수정
              </button>
            </div>

            <div className="tp2-rankHint">
              {qs.map((q) => (
                <div key={q.id} className="tp2-rankRow">
                  <div className="tp2-meta">{q.title}</div>
                  <div className="tp2-meta">{formatAnswer(q, answers as any)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className="tp2-footer">
        <button type="button" className="tp2-btn" onClick={onBack}>
          처음으로
        </button>
        <button type="button" className="tp2-btnPrimary" onClick={() => onBack()}>
          완료
        </button>
      </footer>
    </article>
  );
}
