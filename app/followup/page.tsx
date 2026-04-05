/**
 * TriPlan V3
 * Current Role:
 * - Followup route("/followup")의 엔트리 파일이다.
 *
 * Target Role:
 * - followup chain의 공식 route entry file로 유지되어야 한다.
 *
 * Chain:
 * - followup
 *
 * Inputs:
 * - 없음
 *
 * Outputs:
 * - FollowupMiniApp 렌더링
 *
 * Called From:
 * - Next.js route "/followup"
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
 * - followup route boundary만 맡아야 한다.
 */
import FollowupMiniApp from "./FollowupMiniApp";

export default function FollowupPage() {
  return <FollowupMiniApp />;
}
