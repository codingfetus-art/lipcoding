"use client";

import { useEffect, useCallback, useState } from "react";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { Mic, MicOff } from "lucide-react";

import { useChecklist } from "@/hooks/useChecklist";
import { useAlarms } from "@/hooks/useAlarms";
import { useWeather } from "@/hooks/useWeather";
import { useVoice } from "@/hooks/useVoice";

import WeatherWidget from "@/components/WeatherWidget";
import ChecklistPanel from "@/components/ChecklistPanel";
import AlarmPanel from "@/components/AlarmPanel";

export default function Dashboard() {
  const {
    checklists,
    activeChecklist,
    activeId,
    setActiveId,
    createChecklist,
    deleteChecklist,
    addItem,
    toggleItem,
    removeItem,
    updateItemDuration,
    clearDoneItems,
  } = useChecklist();

  const {
    alarms,
    pendingAlarms,
    notifPermission,
    requestNotifPermission,
    addAlarm,
    removeAlarm,
    clearFiredAlarms,
  } = useAlarms();

  const { weather, location, loading: weatherLoading, error: weatherError, refresh: refreshWeather } = useWeather();
  const { isListening, supported: voiceSupported, startListening, speak } = useVoice();

  const [todayStr, setTodayStr] = useState("");

  useEffect(() => {
    setTodayStr(
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    );
  }, []);

  useCopilotReadable({
    description: "현재 활성화된 체크리스트와 모든 체크리스트 목록",
    value: { activeChecklist, allChecklists: checklists },
  });

  useCopilotReadable({
    description: "현재 날씨 정보 (온도, 날씨 상태, 비/눈/추위/더위 여부)",
    value: weather,
  });

  useCopilotReadable({
    description: "설정된 알람 목록",
    value: { pendingAlarms, allAlarms: alarms },
  });

  useCopilotReadable({
    description: "현재 날짜와 시간",
    value: new Date().toLocaleString("ko-KR"),
  });

  // ─── CopilotKit Actions ──────────────────────────────────────────────────────

  useCopilotAction({
    name: "createChecklist",
    description: "새 외출 준비 체크리스트를 만듭니다",
    parameters: [
      { name: "name", type: "string", description: "체크리스트 이름 (예: 면접, 여행, 데이트)" },
      { name: "destination", type: "string", description: "목적지 (선택)", required: false },
    ],
    handler: async ({ name, destination }) => {
      const list = createChecklist(name, destination as string | undefined);
      return `'${name}' 체크리스트를 만들었어요!`;
    },
  });

  useCopilotAction({
    name: "addChecklistItems",
    description: "현재 활성 체크리스트에 여러 항목을 추가합니다",
    parameters: [
      {
        name: "items",
        type: "object[]",
        description: "추가할 항목 목록",
        attributes: [
          { name: "text", type: "string", description: "항목 이름" },
          { name: "category", type: "string", description: "카테고리 (선택)", required: false },
        ],
      },
      {
        name: "checklistId",
        type: "string",
        description: "대상 체크리스트 ID (생략하면 현재 활성 체크리스트)",
        required: false,
      },
    ],
    handler: async ({ items, checklistId }) => {
      const targetId = (checklistId as string | undefined) ?? activeId;
      if (!targetId) return "먼저 체크리스트를 만들어 주세요";
      let added = 0;
      for (const item of items as { text: string; category?: string }[]) {
        addItem(targetId, item.text, item.category);
        added++;
      }
      return `${added}개 항목을 추가했어요`;
    },
  });

  useCopilotAction({
    name: "toggleChecklistItem",
    description: "체크리스트 항목을 완료/미완료로 토글합니다",
    parameters: [
      { name: "checklistId", type: "string", description: "체크리스트 ID" },
      { name: "itemId", type: "string", description: "항목 ID" },
    ],
    handler: async ({ checklistId, itemId }) => {
      toggleItem(checklistId as string, itemId as string);
      return "항목 상태를 변경했어요";
    },
  });

  useCopilotAction({
    name: "setAlarm",
    description: "외출 준비 알람을 설정합니다. 음성으로 알림을 받을 수 있어요.",
    parameters: [
      { name: "label", type: "string", description: "알람 이름 (예: 출발 30분 전 확인)" },
      {
        name: "minutesFromNow",
        type: "number",
        description: "지금으로부터 몇 분 후에 알람을 울릴지",
      },
    ],
    handler: async ({ label, minutesFromNow }) => {
      if (notifPermission !== "granted") {
        await requestNotifPermission();
      }
      const triggerAt = Date.now() + (minutesFromNow as number) * 60 * 1000;
      addAlarm(label as string, triggerAt, activeId ?? undefined);
      return `${minutesFromNow}분 후 '${label}' 알람을 설정했어요 ⏰`;
    },
  });

  useCopilotAction({
    name: "readChecklistAloud",
    description: "현재 체크리스트의 미완료 항목을 음성으로 읽어드립니다",
    parameters: [],
    handler: async () => {
      if (!activeChecklist) return "읽을 체크리스트가 없어요";
      const pending = activeChecklist.items.filter((i) => !i.done);
      if (pending.length === 0) {
        speak("모든 항목을 완료했어요! 출발 준비가 됐어요!");
        return "모든 항목 완료!";
      }
      const text = `아직 ${pending.length}개 항목이 남아 있어요. ${pending.map((i) => i.text).join(", ")}`;
      speak(text);
      return text;
    },
  });

  useCopilotAction({
    name: "setItemDuration",
    description: "사용자가 말해준 소요 시간을 체크리스트 항목에 저장합니다 (예: '샤워하는 데 30분 걸려')",
    parameters: [
      { name: "checklistId", type: "string", description: "체크리스트 ID" },
      { name: "itemId", type: "string", description: "항목 ID" },
      { name: "durationMinutes", type: "number", description: "소요 시간 (분)" },
    ],
    handler: async ({ checklistId, itemId, durationMinutes }) => {
      updateItemDuration(checklistId as string, itemId as string, durationMinutes as number, "user");
      return `${durationMinutes}분으로 저장했어요`;
    },
  });

  useCopilotAction({
    name: "estimateItemDurations",
    description: "체크리스트 항목들의 소요 시간을 AI가 예측해서 저장합니다",
    parameters: [
      {
        name: "estimates",
        type: "object[]",
        description: "예측 목록",
        attributes: [
          { name: "itemId", type: "string", description: "항목 ID" },
          { name: "durationMinutes", type: "number", description: "예측 소요 시간 (분)" },
          { name: "reason", type: "string", description: "예측 이유 (선택)", required: false },
        ],
      },
      { name: "checklistId", type: "string", description: "대상 체크리스트 ID", required: false },
    ],
    handler: async ({ estimates, checklistId }) => {
      const targetId = (checklistId as string | undefined) ?? activeId;
      if (!targetId) return "체크리스트를 먼저 선택해 주세요";
      for (const est of estimates as { itemId: string; durationMinutes: number }[]) {
        updateItemDuration(targetId, est.itemId, est.durationMinutes, "ai");
      }
      return `${estimates.length}개 항목의 소요 시간을 예측했어요 ✨`;
    },
  });

  useCopilotAction({
    name: "suggestItemsByWeather",
    description: "현재 날씨에 맞는 준비물을 체크리스트에 추가합니다",
    parameters: [],
    handler: async () => {
      if (!weather) return "날씨 정보를 먼저 불러와 주세요";
      if (!activeId) return "먼저 체크리스트를 만들어 주세요";
      const suggestions: string[] = [];
      if (weather.isRaining) suggestions.push("우산", "방수 가방");
      if (weather.isCold) suggestions.push("두꺼운 외투", "장갑", "목도리");
      if (weather.isHot) suggestions.push("선크림", "선글라스", "물");
      if (weather.isSnowing) suggestions.push("방수 부츠", "핫팩");
      if (suggestions.length === 0) return "오늘 날씨는 특별한 준비물이 필요 없어요 😊";
      for (const s of suggestions) addItem(activeId, s, "날씨");
      return `날씨 기반으로 ${suggestions.join(", ")}을(를) 추가했어요`;
    },
  });

  // AI에게 특정 항목 시간 예측 요청 (버튼 클릭 시)
  const handleRequestAiDuration = useCallback(
    async (checklistId: string, itemId: string, itemText: string) => {
      // useCopilotChat으로 메시지 전송 대신 직접 estimateItemDurations action을 트리거
      // AI 사이드바에 프롬프트를 보내도록 음성으로 안내
      speak(`${itemText} 항목의 소요 시간을 AI에게 물어볼게요. 오른쪽 AI 도우미 채팅을 확인해 주세요.`);
    },
    [speak]
  );

  // ─── Voice: 마이크 버튼으로 CopilotKit 채팅에 음성 입력 ───────────────────────

  const handleVoiceInput = useCallback(async () => {
    if (!voiceSupported) {
      alert("이 브라우저는 음성 인식을 지원하지 않아요");
      return;
    }
    try {
      await startListening();
    } catch (err) {
      console.error(err);
    }
  }, [voiceSupported, startListening]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 md:p-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">외출 준비 도우미 🚀</h1>
            <p className="text-white/50 text-sm mt-0.5">{todayStr}</p>
          </div>

          {/* Voice button */}
          {voiceSupported && (
            <button
              onClick={handleVoiceInput}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                isListening
                  ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
                  : "bg-indigo-500/30 hover:bg-indigo-500/50 text-indigo-200 border border-indigo-500/30"
              }`}
            >
              {isListening ? (
                <>
                  <MicOff size={16} />
                  듣는 중...
                </>
              ) : (
                <>
                  <Mic size={16} />
                  음성 입력
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-160px)]">
        {/* Left column: Weather + Alarm */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <WeatherWidget
            weather={weather}
            location={location}
            loading={weatherLoading}
            error={weatherError}
            onRefresh={refreshWeather}
          />
          <AlarmPanel
            alarms={alarms}
            pendingAlarms={pendingAlarms}
            notifPermission={notifPermission}
            onRequestPermission={requestNotifPermission}
            onAddAlarm={addAlarm}
            onRemoveAlarm={removeAlarm}
            onClearFired={clearFiredAlarms}
          />
        </div>

        {/* Right columns: Checklist */}
        <div className="lg:col-span-2 min-h-0">
          <ChecklistPanel
            checklists={checklists}
            activeChecklist={activeChecklist}
            activeId={activeId}
            onSetActive={setActiveId}
            onCreateChecklist={createChecklist}
            onDeleteChecklist={deleteChecklist}
            onAddItem={addItem}
            onToggleItem={toggleItem}
            onRemoveItem={removeItem}
            onUpdateDuration={updateItemDuration}
            onClearDone={clearDoneItems}
            onRequestAiDuration={handleRequestAiDuration}
          />
        </div>
      </div>

      {/* CopilotKit Sidebar */}
      <CopilotSidebar
        instructions={`당신은 한국어로 대화하는 외출 준비 도우미 AI입니다.
사용자가 외출 준비를 할 때 도움을 드립니다.
현재 날씨, 체크리스트, 알람 정보를 참고해서 맞춤형 조언을 해주세요.
- 상황에 맞는 체크리스트를 만들어 주세요 (면접, 여행, 데이트, 운동 등)
- 날씨에 따른 준비물을 추천해 주세요
- 출발 시간에 맞는 알람을 설정해 주세요
- 사용자가 요청하면 체크리스트를 음성으로 읽어주세요
항상 친근하고 도움이 되는 어조로 대화하세요.`}
        defaultOpen={false}
        labels={{
          title: "AI 도우미 🤖",
          initial: "안녕하세요! 오늘 외출 준비를 도와드릴게요 😊\n\n어디 가시나요? 목적지와 시간을 알려주시면 맞춤 체크리스트를 만들어 드릴게요!",
        }}
      />
    </div>
  );
}
