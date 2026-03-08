"use client";

import type { SecondaryAnswers, SecondarySection } from "./secondarySchema";
import type { SecondaryQuestion } from "./secondaryQuestions";

type Section = SecondarySection;

const SECTION_LABEL: Record<Section, string> = {
  G: "기본 정보",
  A: "시간대 · 리듬",
  B: "음식 리스크",
  C: "이동 제약",
  D: "숙소 전략",
  E: "동행 조율",
  F: "핵심 장소 · 이유",
  H: "특별 맥락 · 성공 기준",
};

function groupBySection(questions: SecondaryQuestion[]) {
  const map = new Map<Section, SecondaryQuestion[]>();

  for (const q of questions) {
    const sec = q.section;
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(q);
  }

  const order: Section[] = ["G", "A", "B", "C", "D", "E", "F", "H"];

  return order
    .filter((s) => map.has(s))
    .map((s) => [s, (map.get(s) || []).slice()] as const);
}

function formatPlaceItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "—";

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const place = item as Record<string, unknown>;
      const name = typeof place.name === "string" ? place.name : "";
      const reason = typeof place.reason === "string" ? place.reason : "";
      const importance =
        typeof place.importance === "string" ? place.importance : "";

      const parts = [name, reason, importance].filter(Boolean);
      return parts.join(" / ");
    })
    .filter(Boolean)
    .join(", ");
}

function formatAnswer(q: SecondaryQuestion, answers: Record<string, any>) {
  const value = answers[q.id];

  if (value == null) return "—";

  if (q.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (q.id === "partySize") return `${n}명`;
    return String(n);
  }

  if (q.type === "multi" ) {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
  }

  if (q.type === "places") {
    return formatPlaceItems(value);
  }

  if (q.type === "textarea") {
    return typeof value === "string" && value.trim() ? value : "—";
  }

  if (q.type === "country" || q.type === "city" || q.type === "single") {
    return typeof value === "string" && value.trim() ? value : "—";
  }

  return Array.isArray(value) ? value.join(", ") : String(value);
}

export default function SecondarySummaryView(props: {
  questions: SecondaryQuestion[];
  answers: SecondaryAnswers | Record<string, any>;
  onEditSection: (section: Section) => void;
  onBack: () => void;
  onReview: () => void;
}) {
  const { questions, answers, onEditSection, onBack, onReview } = props;
  const sections = groupBySection(questions);

  return (
    <article className="tp2-card" aria-label="summary-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">설정값 확인</div>
        <h2 className="tp2-h2">여행 설계 입력</h2>
        <p className="tp2-body tp2-help">
          섹션 단위로 수정하고, 완료되면 다시 여기로 돌아온다.
        </p>
      </header>

      <div className="tp2-controls tp2-controlsScrollable">
        {sections.map(([sec, qs]) => (
          <div key={sec} className="tp2-subcard">
            <div className="tp2-row">
              <div className="tp2-body">{SECTION_LABEL[sec]}</div>
              <button
                type="button"
                className="tp2-btn"
                onClick={() => onEditSection(sec)}
              >
                수정
              </button>
            </div>

            {qs.map((q) => (
              <div key={q.id} className="tp2-row">
                <div className="tp2-meta">{q.title}</div>
                <div className="tp2-meta">
                  {formatAnswer(q, answers as Record<string, any>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <footer className="tp2-footer">
        <button type="button" className="tp2-btn" onClick={onBack}>
          처음으로
        </button>
        <button type="button" className="tp2-btnPrimary" onClick={onReview}>
          검토 시작
        </button>
      </footer>
    </article>
  );
}
