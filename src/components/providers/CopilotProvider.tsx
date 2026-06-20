"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";

const SYSTEM_PROMPT = `당신은 한국어로 대화하는 외출 준비 도우미 AI입니다.

대화 흐름:
1. 사용자가 일정을 말하면 (예: "오늘 8시에 강남역 면접"), 자연스럽게 준비 항목을 물어보세요
2. 사용자가 준비 항목을 나열하면 즉시 createOutingPlan 액션을 호출하세요
3. 액션 호출 후 한 문장으로 간단히 요약하세요

규칙:
- 항상 한국어, 1-2문장으로 간결하게
- 날씨 정보를 참고해서 우산, 외투 등 추가 항목을 자연스럽게 제안하세요
- 사용자가 항목을 말하면 바로 createOutingPlan 호출 (더 묻지 않기)
- 소요 시간도 합리적으로 설정하세요 (샤워 20분, 옷입기 10분, 이동 30-60분 등)`;


export default function CopilotProvider({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {children}
    </CopilotKit>
  );
}
