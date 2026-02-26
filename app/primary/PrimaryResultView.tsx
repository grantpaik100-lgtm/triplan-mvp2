"use client";

import { typeMeta } from "./typeMeta";

type Props = {
  type: "rest" | "schedule" | "mood" | "strategy";
  gender: "m" | "f";
  onStartTrip: () => void;
};

export default function PrimaryResultView({
  type,
  gender,
  onStartTrip,
}: Props) {
  const meta = typeMeta[type];
  const imageSrc = `/images/type_${type}_${gender}.PNG`;

  return (
    <div style={{ textAlign: "center", padding: "24px" }}>
      <img
        src={imageSrc}
        alt={meta.name}
        style={{ width: "80%", maxWidth: 320 }}
      />

      <h1 style={{ fontSize: 28, marginTop: 20 }}>{meta.name}</h1>
      <p style={{ fontWeight: 500 }}>{meta.slogan}</p>
      <p style={{ marginTop: 12, opacity: 0.8 }}>{meta.description}</p>

      <div style={{ marginTop: 24 }}>
        <button style={{ marginRight: 12 }}>공유하기</button>
        <button>결과 저장하기</button>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={onStartTrip}
          style={{
            padding: "12px 24px",
            fontWeight: 600,
          }}
        >
          나만의 여행 설계하기
        </button>
      </div>
    </div>
  );
}
