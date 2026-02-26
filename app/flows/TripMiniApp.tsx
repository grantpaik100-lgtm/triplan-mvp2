"use client";

type Props = {
  setMode: (mode: "primary" | "trip" | "assist") => void;
};

export default function TripMiniApp({ setMode }: Props) {
  return (
    <div style={{ padding: 40 }}>
      <h1>이제 진짜 여행 설계를 시작합니다.</h1>
      <button onClick={() => setMode("assist")}>AI 상담 시작</button>
    </div>
  );
}
