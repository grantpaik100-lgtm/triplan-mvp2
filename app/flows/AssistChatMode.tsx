"use client";

type Props = {
  setMode: (mode: "primary" | "trip" | "assist") => void;
};

export default function AssistChatMode({ setMode }: Props) {
  return (
    <div style={{ padding: 40 }}>
      <h1>AI 상담 모드</h1>
      <button onClick={() => setMode("primary")}>처음으로</button>
    </div>
  );
}
