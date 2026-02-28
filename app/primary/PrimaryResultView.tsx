"use client";

import { useMemo, useRef, useState } from "react";
import { typeMeta } from "./typeMeta";

type PT = "rest" | "schedule" | "mood" | "strategy";
type Gender = "m" | "f";

type Meta = {
  name: string;
  slogan: string;
  description: string;
  bullets?: string[]; // ✅ 선택(optional)로 정식 지원
};

type Props = {
  type: PT;
  gender: Gender;
  nickname: string;
  onStartTrip: () => void;
};

export default function PrimaryResultView({
  type,
  gender,
  nickname,
  onStartTrip,
}: Props) {
  const meta = typeMeta[type] as Meta;
  const imageSrc = `/images/type_${type}_${gender}.PNG`;

  const captureRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);

  const shareText = useMemo(() => {
    return `TriPlan 여행 성향 테스트 결과: ${meta.name} · ${meta.slogan}`;
  }, [meta.name, meta.slogan]);

  const handleShare = async () => {
    try {
      const url = window.location.href;

      if (navigator.share) {
        await navigator.share({
          title: "TriPlan 여행 성향 테스트",
          text: shareText,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      alert("링크를 복사했어.");
    } catch {
      alert("공유/복사에 실패했어.");
    }
  };

  const handleSave = async () => {
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
        <div ref={captureRef} className="tp-capture">
          <img className="tp-result-img" src={imageSrc} alt={meta.name} />

          <div className="tp-muted" style={{ fontSize: 13, marginTop: 6 }}>
            {nickname}님의 결과
          </div>

          <h1 className="tp-result-name">{meta.name}</h1>
          <div className="tp-result-slogan">{meta.slogan}</div>
          <p className="tp-result-desc">{meta.description}</p>

          {!!meta.bullets?.length && (
            <div style={{ marginTop: 14, textAlign: "left" }}>
              {meta.bullets.slice(0, 2).map((line, i) => (
                <div
                  key={i}
                  className="tp-muted"
                  style={{
                    lineHeight: 1.6,
                    marginTop: i === 0 ? 0 : 8,
                  }}
                >
                  · {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tp-actions">
          <button className="tp-action-btn" onClick={handleShare}>
            공유하기
          </button>
          <button
            className="tp-action-btn"
            onClick={handleSave}
            disabled={saving}
          >
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
