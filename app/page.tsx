"use client";

import { useState } from "react";
import PrimaryMiniApp from "../flows/PrimaryMiniApp";
import TripMiniApp from "../flows/TripMiniApp";
import AssistChatMode from "../flows/AssistChatMode";

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
