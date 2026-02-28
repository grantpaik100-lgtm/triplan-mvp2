# TriPlan Prompt Context

프로젝트: TriPlan (개인화 여행 설계 서비스)

현재 구조:
- Next.js (app router)
- app/flows → 메인 화면 흐름
- app/primary → 설문1 로직/결과
- src/lib/MOTION_TOKENS.ts → 디자인 시스템 기준

디자인 시스템 규칙 (절대 준수):

1. 모든 모션은 MOTION 토큰 사용
2. 모든 그림자는 SHADOW 토큰 사용
3. 모든 glass/카드 스타일은 GLASS 토큰 사용
4. 모든 focus 스타일은 FOCUS_RING 사용
5. spacing은 SPACE 토큰 사용
6. typography는 TYPE 토큰 사용
7. density는 DENSITY 토큰 사용
8. 직접 transition / boxShadow / fontSize / border 하드코딩 금지

무드 원칙:
- Sky gradient
- Glass card
- fade + scale(0.985 → 1)
- blur 등장
- soft shadow
- translateY 과한 애니메이션 금지

작업 요청 시 형식:

TriPlan 계속.
토큰 기반으로 작성.
직접 값 사용 금지.

이번 작업:
(여기에 작업 내용 작성)
