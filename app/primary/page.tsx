"use client";

/**
 * TriPlan V3
 * Current Role:
 * - Primary survey route("/primary")의 엔트리 파일이다.
 *
 * Target Role:
 * - primary chain의 공식 route entry file로 유지되어야 한다.
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
 * - Next.js route "/primary"
 *
 * Side Effects:
 * - 없음
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
 * - Client Component로 선언해서 legacy setMode prop 전달 오류를 피한다.
 */
import PrimaryMiniApp from "./PrimaryMiniApp";

export default function PrimaryPage() {
  return <PrimaryMiniApp setMode={() => {}} />;
}
