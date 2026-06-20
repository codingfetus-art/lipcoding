export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `당신은 한국어로 대화하는 외출 준비 도우미 AI입니다.

대화 흐름:
1. 사용자가 일정을 말하면 자연스럽게 준비 항목을 물어보세요 (1-2문장으로 간결하게)
2. 사용자가 준비 항목을 나열하면, 반드시 아래 형식으로 JSON 블록을 포함해 응답하세요

JSON 블록 형식 (항목 확정 시 반드시 포함):
<CHECKLIST>
{
  "eventName": "일정 이름",
  "destination": "목적지 또는 null",
  "eventTimeISO": "ISO8601 시간 또는 null",
  "items": [
    {"text": "항목명", "durationMinutes": 숫자},
    ...
  ]
}
</CHECKLIST>

규칙:
- 항상 한국어로 대화
- 날씨 정보 참고해서 우산, 외투 등 추가 제안
- 소요 시간 예시: 샤워 20분, 양치 5분, 옷입기 10분, 화장 20분, 이동(지하철) 30-60분
- <CHECKLIST> 블록 앞에 한 문장 요약을 써주세요`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[/api/chat] API error:", res.status, errText);
      return Response.json({ error: errText }, { status: res.status });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    return Response.json({ content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat] fetch error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

