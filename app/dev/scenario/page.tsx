"use client";

/**
 * TriPlan V3
 * Current Role:
 * - dev scenario를 선택해 sessionStorage에 canonical input을 주입하고 generate 체인으로 보내는 내부 테스트 route다.
 *
 * Target Role:
 * - 설문 반복 없이 engine 테스트를 수행하는 공식 dev entry가 되어야 한다.
 *
 * Chain:
 * - generate
 *
 * Inputs:
 * - scenario name
 *
 * Outputs:
 * - sessionStorage.triplan_primary_result
 * - sessionStorage.triplan_planning_input
 * - /trip/generate navigation
 *
 * Called From:
 * - /dev/scenario route
 *
 * Side Effects:
 * - sessionStorage write
 * - navigation
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
 * - dev/internal route다.
 * - 사용자용 설문 체인을 대체하는 것이 아니라 엔진 반복 실험 속도를 올리기 위한 route다.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getScenarioNames, loadScenario } from "@/lib/trip/scenarioLoader";

export default function DevScenarioPage() {
  const router = useRouter();
  const names = getScenarioNames();
  const [selected, setSelected] = useState(names[0] ?? "");

  function handleRun() {
    const scenario = loadScenario(selected);

    const primaryResult = {
      ...scenario.primaryResult,
      completedAt: new Date().toISOString(),
      source: "dev_scenario",
      scenarioName: scenario.name,
    };

    const planningInput = {
      ...scenario.planningInput,
      source: "dev_scenario",
      scenarioName: scenario.name,
    };

    sessionStorage.setItem("triplan_primary_result", JSON.stringify(primaryResult));
    sessionStorage.setItem("primaryResult", JSON.stringify(primaryResult));

    sessionStorage.setItem("triplan_planning_input", JSON.stringify(planningInput));

    router.push("/trip/generate");
  }

  return (
    <main>
      <h1>TriPlan Dev Scenario Runner</h1>

      <p>설문 없이 scenario JSON으로 바로 generate/result까지 실행한다.</p>

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <div>
        <button onClick={handleRun}>Run scenario</button>
      </div>
    </main>
  );
}
