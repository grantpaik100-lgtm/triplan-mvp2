"use client";

import { useMemo, useRef, useState } from "react";
import { typeMeta } from "./typeMeta";

type PT = "rest" | "schedule" | "mood" | "strategy";
type Gender = "m" | "f";

type Props = {
  type: PT;
  gender: Gender;
  onStartTrip: () => void;
};

function safeFileName(s: string) {
  return s.replaceAll(" ", "_").replaceAll("/", "_");
}

export default function PrimaryResultView({ type, gender, onStartTrip }: Props) {
  const meta = typeMeta[type];
  const imageSrc = `/images/type_${type}_${gender}.PNG`;

  const captureRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);

  const shareText = useMemo(() => {
    return `TriPlan 여행 성향 테스트 결과: ${meta.name} · ${meta.slogan}`;
  }, [meta.name, meta.slogan]);

  const handleShare = async () => {
    try {
      const url = window.location.href;
      // 모바일 우선: Web Share API
      if (navigator.share) {
        await navigator.share({
          title: "TriPlan 여행 성향 테스트",
          text: shareText,
          url,
        });
        return;
      }
      // fallback: 링크 복사
      await navigator.clipboard.writeText(url);
      alert("링크를 복사했어.");
    } catch {
      alert("공유/복사에 실패했어.");
    }
  };

  // 결과 저장(이미지): 외부 라이브러리 없이 "화면 스크린샷"은 웹표준만으로 불가.
  // 그래서 MVP에서는 2단계 전략:
  // 1) 결과 카드 자체를 '인쇄(PDF/이미지)'로 저장 유도 (브라우저/OS 공유)
  // 2) 다음 단계에서 html-to-image 라이브러리(예: html-to-image) 추가해 PNG 저장을 진짜 구현
  const handleSave = async () => {
    // 지금은 가장 안전한 MVP 방식: print(모바일 공유/저장 경로로 이어짐)
    // iOS/Android에서 "공유/저장"으로 이어질 수 있음.
    try {
      setSaving(true);
      window.print();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tp-wrap">
      <div className="tp-card tp-anim-in" style={{ textAlign: "center" }}>
        {/* 캡처 타겟(나중에 PNG 저장 라이브러리 붙일 때 이 영역만 캡처) */}
        <div ref={captureRef} className="tp-capture">
          <img className="tp-result-img" src={imageSrc} alt={meta.name} />
          <h1 className="tp-result-name">{meta.name}</h1>
          <div className="tp-result-slogan">{meta.slogan}</div>
          <p className="tp-result-desc">{meta.description}</p>
        </div>

        <div className="tp-actions">
          <button className="tp-action-btn" onClick={handleShare}>
            공유하기
          </button>
          <button className="tp-action-btn" onClick={handleSave} disabled={saving}>
            {saving ? "저장중..." : "결과 저장하기"}
          </button>
        </div>

        <button className="tp-cta2" onClick={onStartTrip}>
          나만의 여행 설계하기
        </button>
      </div>
    </div>
  );
}
