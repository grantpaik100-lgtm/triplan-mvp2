/**
 * TriPlan V3
 * Current Role:
 * - legacy mode shell의 루트 엔트리였으나 현재 구조와 맞지 않는다.
 *
 * Target Role:
 * - canonical primary chain("/primary")으로 보내는 최소 route boundary가 되어야 한다.
 *
 * Chain:
 * - primary
 *
 * Inputs:
 * - 없음
 *
 * Outputs:
 * - /primary redirect
 *
 * Called From:
 * - Next.js route "/"
 *
 * Side Effects:
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
 * - flows 기반 legacy shell import를 모두 제거한다.
 * - root는 더 이상 mode switch UI를 가지지 않는다.
 */
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/primary");
}
