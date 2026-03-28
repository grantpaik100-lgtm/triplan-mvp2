"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function TripGeneratePage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      try {
        const planningInputRaw = sessionStorage.getItem("triplan_planning_input");
        const primaryResultRaw = sessionStorage.getItem("triplan_primary_result");

        if (!planningInputRaw) {
          throw new Error("Missing triplan_planning_input in sessionStorage");
        }

        const planningInput = JSON.parse(planningInputRaw);
        const primaryResult = primaryResultRaw
          ? JSON.parse(primaryResultRaw)
          : undefined;

        const response = await fetch("/api/generate-trip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            primaryResult,
            planningInput,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to generate trip");
        }

        sessionStorage.setItem("triplan_trip_result", JSON.stringify(data.result));
        sessionStorage.setItem("tripResult", JSON.stringify(data.result));

        router.replace("/trip/result");
      } catch (e) {
        console.error("[trip/generate] failed:", e);
        setError(
          e instanceof Error ? e.message : "Failed to generate trip result",
        );
      }
    }

    void run();
  }, [router]);

  if (error) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Trip generation failed
          </div>
          <div style={{ opacity: 0.8 }}>{error}</div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          Generating your trip...
        </div>
      </div>
    </main>
  );
}