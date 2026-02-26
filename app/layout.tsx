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
