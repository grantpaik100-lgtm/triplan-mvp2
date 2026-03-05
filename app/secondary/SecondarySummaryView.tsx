"use client";

import type { SecondaryAnswers } from "./secondarySchema";
import type { SecondaryQuestion, SecondarySection } from "./secondaryQuestions";

type Section = SecondarySection;

const SECTION_LABEL: Record<Section, string> = {
  G: "기본 정보",
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
  const order: Section[] = ["G", "A", "B", "C", "D", "E", "F"];
  return order
    .filter((s) => map.has(s))
    .map((s) => [s, (map.get(s) || []).slice().sort((a, b) => a.orderInSection - b.orderInSection)] as const);
}

function formatAnswer(q: SecondaryQuestion, answers: Record<string, any>) {
  const v = answers[q.id];

  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return "—";

  if (q.type === "numberPair") {
    const nights = Number(answers["g_tripNights"]);
    const days = Number(answers["g_tripDays"]);
    if (Number.isFinite(nights) && Number.isFinite(days)) return `${nights}박 ${days}일`;
    return "—";
  }

  if (q.type === "numberOne") {
    const n = Number(v);
    return Number.isFinite(n) ? `${n}명` : "—";
  }

  if (q.type === "tagInput") return Array.isArray(v) ? v.join(", ") : "—";

  if (q.type === "rankAssign") return Array.isArray(v) ? v.map((x: string, i: number) => `${i + 1}순위:${x}`).join(" / ") : "—";

  if (q.type === "places") return Array.isArray(v) ? `${v.length}개` : "—";

  if (Array.isArray(v)) return v.join(", ");

  return String(v);
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
        <p className="tp2-body tp2-help">섹션 단위로 수정하고, 완료되면 다시 여기로 돌아온다.</p>
      </header>

      <div className="tp2-controls tp2-controlsScrollable">
        {sections.map(([sec, qs]) => (
          <div key={sec} className="tp2-subcard">
            <div className="tp2-row">
              <div className="tp2-body">{SECTION_LABEL[sec]}</div>
              <button type="button" className="tp2-btn" onClick={() => onEditSection(sec)}>
                수정
              </button>
            </div>

            {qs.map((q) => (
              <div key={q.id} className="tp2-row">
                <div className="tp2-meta">{q.title}</div>
                <div className="tp2-meta">{formatAnswer(q, answers as any)}</div>
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
