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
 * - legacy shell을 제거한 뒤 primary chain의 route boundary 역할만 담당해야 한다.
 */
import PrimaryMiniApp from "./PrimaryMiniApp";

export default function PrimaryPage() {
  return <PrimaryMiniApp setMode={() => {}} />;
}
