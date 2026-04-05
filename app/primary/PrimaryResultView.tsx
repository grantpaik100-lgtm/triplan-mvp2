/**
 * TriPlan V3
 * Current Role:
 * - Primary result를 사용자에게 시각적으로 보여주고 secondary chain으로 넘기는 결과 화면 컴포넌트다.
 *
 * Target Role:
 * - primary result explanation / handoff UI의 공식 뷰 컴포넌트로 유지되어야 한다.
 *
 * Chain:
 * - primary
 *
 * Inputs:
 * - primaryResult
 *
 * Outputs:
 * - result UI rendering
 * - secondary route 이동 트리거
 *
 * Called From:
 * - app/flows/PrimaryMiniApp.tsx
 *
 * Side Effects:
 * - route navigation
 *
 * Current Status:
 * - canonical
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - Primary survey 자체보다 덜 핵심이지만, chain 연결상 삭제하면 안 된다.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { typeMeta } from "./typeMeta";
import { MOTION, GLASS, SHADOW, FOCUS_RING } from "@/lib/MOTION_TOKENS";

type PT = "rest" | "schedule" | "mood" | "strategy";
type Gender = "m" | "f";

type Meta = {
  name: string;
  slogan: string;
  description: string;
  bullets?: string[];
};

type Props = {
  type: PT;
  gender: Gender;
  nickname: string;
  onStartTrip: () => void;
};

export default function PrimaryResultView({ type, gender, nickname, onStartTrip }: Props) {
  const meta = typeMeta[type] as Meta;
  const imageSrc = `/images/type_${type}_${gender}.PNG`;

  const captureRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);

  const shareText = useMemo(() => {
    return `TriPlan 여행 성향 테스트 결과: ${meta.name} · ${meta.slogan}`;
  }, [meta.name, meta.slogan]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(false);
    const t = window.setTimeout(() => setMounted(true), 10);
    return () => window.clearTimeout(t);
  }, [type, gender]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    const d = MOTION.duration.slow;
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
      <div className="tp-card tp-anim-in" style={cardStyle}>
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
                  style={{ lineHeight: 1.6, marginTop: i === 0 ? 0 : 8 }}
                >
                  · {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tp-actions">
          <button
            className="tp-action-btn"
            onClick={handleShare}
            style={{
              outline: "none",
              transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = FOCUS_RING.ring;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            공유하기
          </button>

          <button
            className="tp-action-btn"
            onClick={handleSave}
            disabled={saving}
            style={{
              outline: "none",
              transition: `box-shadow ${MOTION.duration.fast}ms ${MOTION.easing}`,
              opacity: saving ? 0.75 : 1,
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = FOCUS_RING.ring;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {saving ? "저장중..." : "결과 저장하기"}
          </button>
        </div>

        <button
  type="button"
  className="tp-cta2"
  onClick={onStartTrip}
>
  나만의 여행 설계하기
</button>
      </div>
    </div>
  );
}
