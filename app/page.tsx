/**
 * TriPlan V3
 * Current Role:
 * - 현재 root("/")에서 PrimaryMiniApp을 진입점으로 렌더링하는 루트 엔트리 파일이다.
 *
 * Target Role:
 * - TriPlan V3 primary chain의 공식 시작점만 담당하는 최소 루트 엔트리 파일이어야 한다.
 *
 * Chain:
 * - primary
 *
 * Inputs:
 * - 없음
 *
 * Outputs:
 * - PrimaryMiniApp 렌더링
 *
 * Called From:
 * - Next.js app router root route ("/")
 *
 * Side Effects:
 * - 없음
 *
 * Current Status:
 * - canonical, but simplified shell needed
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - 과거 mode-switch shell(primary/trip/assist)을 제거하고 primary entry only로 고정하는 것이 맞다.
 */
"use client";

import { useState } from "react";
import PrimaryMiniApp from "./flows/PrimaryMiniApp";
import TripMiniApp from "./flows/TripMiniApp";
import AssistChatMode from "./flows/AssistChatMode";

export default function Home() {
  const [mode, setMode] = useState<"primary" | "trip" | "assist">("primary");

  return (
    <main style={{ minHeight: "100vh" }}>
      {mode === "primary" && <PrimaryMiniApp setMode={setMode} />}
      {mode === "trip" && <TripMiniApp setMode={setMode} />}
      {mode === "assist" && <AssistChatMode setMode={setMode} />}
    </main>
  );
}
