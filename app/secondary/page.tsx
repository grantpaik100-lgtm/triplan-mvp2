/**
 * TriPlan V3
 * Current Role:
 * - Secondary survey route("/secondary")의 엔트리 파일이다.
 *
 * Target Role:
 * - Secondary chain의 공식 route entry file로 유지되어야 한다.
 *
 * Chain:
 * - secondary
 *
 * Inputs:
 * - 없음
 *
 * Outputs:
 * - SecondaryMiniApp 렌더링
 *
 * Called From:
 * - Next.js route "/secondary"
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
 * - secondary 체인의 route boundary 역할만 담당해야 한다.
 */
// app/secondary/page.tsx
import SecondaryMiniApp from "./SecondaryMiniApp";

export default function SecondaryPage() {
  return <SecondaryMiniApp />;
}
