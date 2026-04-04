"use client";

import PrimaryMiniApp from "./flows/PrimaryMiniApp";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh" }}>
      <PrimaryMiniApp setMode={() => {}} />
    </main>
  );
}
