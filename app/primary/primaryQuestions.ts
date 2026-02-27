export type ScaleQuestion = {
  id: string;
  title: string;
};

export const primaryQuestions: ScaleQuestion[] = [
  // Energy (체력과 리듬)
  { id: "q1",  title: "일정이 빡빡하면, 나는 금방 지친다." },
  { id: "q2",  title: "하루에 여러 곳을 돌아다녀도, 나는 에너지가 쉽게 떨어지지 않는다." },
  { id: "q3",  title: "여행 중 쉬는 시간이 없으면, 컨디션이 눈에 띄게 떨어진다." },

  // Exploration (새로움과 로컬)
  { id: "q4",  title: "사람들이 많이 가는 곳보다, 덜 알려진 장소를 발견할 때 더 즐겁다." },
  { id: "q5",  title: "익숙하지 않은 문화나 분위기를 마주하면, 흥미가 더 생긴다." },

  // Experience (음식과 분위기)
  { id: "q6",  title: "음식이 내 입맛에 맞지 않으면, 여행이 힘들게 느껴진다." },
  { id: "q7",  title: "유명한 명소보다, 그 공간의 분위기가 더 기억에 남는다." },

  // Efficiency (이동과 대기)
  { id: "q8",  title: "이동 시간이 길어지면, 여행의 즐거움이 줄어든다." },
  { id: "q9",  title: "줄을 오래 서야 하면, 만족도가 떨어진다." },
  { id: "q10", title: "대기 시간이 길어질 것 같으면, 다른 선택지를 찾는 편이다." },

  // Structure (계획과 즉흥)
  { id: "q11", title: "일정이 어느 정도 정해져 있지 않으면, 마음이 불편해진다." },
  { id: "q12", title: "즉흥적으로 계속 움직여야 하면, 스트레스를 받는다." },

  // Cost (돈과 만족)
  { id: "q13", title: "여행 중 지출이 예상보다 커지면, 계속 신경이 쓰인다." },
  { id: "q14", title: "비용이 조금 더 들더라도 만족도가 높다면, 그 선택이 아깝지 않다." },
];

