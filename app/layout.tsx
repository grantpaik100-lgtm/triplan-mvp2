/**
 * TriPlan V3
 * Current Role:
 * - Next.js App Router의 최상위 layout file이다.
 *
 * Target Role:
 * - 앱 전역 layout boundary로 유지되어야 한다.
 *
 * Chain:
 * - system
 *
 * Inputs:
 * - children
 *
 * Outputs:
 * - app-wide layout
 *
 * Called From:
 * - Next.js app router
 *
 * Side Effects:
 * - global wrapper effects 가능
 *
 * Current Status:
 * - canonical system file
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - framework 필수 파일이다.
 */

import "./globals.css";

export const metadata = {
  title: "TriPlan",
  description: "모바일 우선 여행 설계 플로우",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}
