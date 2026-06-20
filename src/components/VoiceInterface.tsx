"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, CheckSquare, Square, RotateCcw, MapPin, Clock, Play } from "lucide-react";
import { useWeather } from "@/hooks/useWeather";
import { useChecklist } from "@/hooks/useChecklist";
import { useAlarms } from "@/hooks/useAlarms";

interface Message { role: "user" | "assistant"; content: string; }
type AppState = "chat" | "result" | "active";

export default function VoiceInterface() {
  const [appState, setAppState] = useState<AppState>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { weather, location } = useWeather();
  const { activeChecklist, createChecklistWithItems, toggleItem } = useChecklist();
  const { addAlarm, requestNotifPermission } = useAlarms();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const parseAndCreateChecklist = useCallback(async (text: string) => {
    const match = text.match(/<CHECKLIST>([\s\S]*?)<\/CHECKLIST>/);
    if (!match) return false;
    try {
      const data = JSON.parse(match[1].trim());
      const eventTime = data.eventTimeISO ? new Date(data.eventTimeISO).getTime() : undefined;
      // 한 번의 상태 업데이트로 체크리스트 + 아이템 생성
      const list = createChecklistWithItems(
        data.eventName,
        data.destination ?? undefined,
        eventTime,
        data.items ?? []
      );
      if (eventTime) {
        const totalMins = (data.items ?? []).reduce((s: number, i: { durationMinutes?: number }) => s + (i.durationMinutes || 0), 0);
        const alarmTs = eventTime - totalMins * 60 * 1000 - 5 * 60 * 1000;
        if (alarmTs > Date.now()) {
          await requestNotifPermission();
          addAlarm(`${data.eventName} 준비 시작`, alarmTs);
        }
      }
      return true;
    } catch (e) {
      console.error("parseAndCreateChecklist error:", e);
      return false;
    }
  }, [createChecklistWithItems, addAlarm, requestNotifPermission]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");

    const weatherCtx = weather
      ? `[날씨: ${weather.description} ${weather.temperature}°C${weather.isRaining ? " 비" : ""}${weather.isCold ? " 추움" : ""}${weather.isHot ? " 더움" : ""}] `
      : "";

    const userMsg: Message = { role: "user", content: weatherCtx + text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { content } = await res.json();

      setMessages(prev => [...prev, { role: "assistant", content }]);
      const created = await parseAndCreateChecklist(content);
      if (created) setAppState("result");
    } catch (e) {
      console.error("Chat error:", e);
      setMessages(prev => [...prev, { role: "assistant", content: "오류가 발생했어요. 다시 시도해 주세요." }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, weather, parseAndCreateChecklist]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleReset = useCallback(() => {
    setAppState("chat");
    setMessages([]);
  }, []);

  // 시간 계산
  const totalMins = activeChecklist?.items.reduce((s, i) => s + (i.durationMinutes ?? 0), 0) ?? 0;
  const startTimeStr = activeChecklist?.eventTime && totalMins > 0
    ? (() => {
        const ts = activeChecklist.eventTime - totalMins * 60 * 1000;
        const diff = Math.round((ts - Date.now()) / 60000);
        const t = new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        if (diff < 0) return `${t} (이미 지남)`;
        if (diff < 60) return `${t} (${diff}분 후)`;
        return `${t} (${Math.floor(diff / 60)}시간 ${diff % 60 > 0 ? diff % 60 + "분 " : ""}후)`;
      })()
    : null;
  const doneCount = activeChecklist?.items.filter(i => i.done).length ?? 0;
  const totalCount = activeChecklist?.items.length ?? 0;

  // AI 메시지에서 <CHECKLIST> 블록 제거하고 표시
  const displayContent = (content: string) =>
    content.replace(/<CHECKLIST>[\s\S]*?<\/CHECKLIST>/g, "").trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center p-4">
      {/* Header */}
      <div className="w-full max-w-md flex justify-between items-center py-3 mb-2 flex-shrink-0">
        <h1 className="text-white/60 text-sm font-medium">외출 준비 도우미</h1>
        {weather && (
          <span className="text-white/50 text-sm flex items-center gap-1.5">
            {weather.icon} {weather.temperature}°C
            {location && <span className="text-white/30 text-xs">· {location.name.split(" ")[0]}</span>}
          </span>
        )}
      </div>

      {/* CHAT */}
      {appState === "chat" && (
        <div className="w-full max-w-md flex flex-col" style={{ height: "calc(100vh - 100px)" }}>
          <div className="flex-1 overflow-y-auto space-y-3 pb-3">
            <div className="flex justify-start">
              <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%]">
                <p className="text-white/80 text-sm">어디 가세요? 언제 약속인지도 알려주세요 😊</p>
              </div>
            </div>

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-indigo-500 text-white rounded-tr-sm"
                    : "bg-white/10 text-white/80 rounded-tl-sm"
                }`}>
                  {msg.role === "user"
                    ? msg.content.replace(/^\[날씨:.*?\] /, "")
                    : displayContent(msg.content)}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-2 pt-2 border-t border-white/10 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 오늘 8시에 강남역 면접이 있어"
              disabled={isLoading}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="w-12 h-12 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-white/10 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* RESULT */}
      {appState === "result" && activeChecklist && (
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <h2 className="text-white text-xl font-semibold">{activeChecklist.name}</h2>
            {activeChecklist.destination && (
              <p className="text-white/50 text-sm flex items-center justify-center gap-1 mt-1">
                <MapPin size={12} /> {activeChecklist.destination}
              </p>
            )}
          </div>

          {weather && (weather.isRaining || weather.isCold || weather.isHot || weather.isSnowing) && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3 text-sm text-indigo-200 flex items-center gap-2">
              <span className="text-lg">{weather.icon}</span>
              <span>
                {weather.isRaining && "비가 와요. 우산을 챙기세요! "}
                {weather.isSnowing && "눈이 와요. 방수 신발이 필요해요! "}
                {weather.isCold && "추워요. 따뜻하게 입으세요! "}
                {weather.isHot && "더워요. 선크림을 바르세요! "}
              </span>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <p className="text-white/60 text-xs font-medium uppercase tracking-wider">준비 목록</p>
            </div>
            <div className="divide-y divide-white/5">
              {activeChecklist.items.map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-white/80 text-sm">{item.text}</span>
                  {item.durationMinutes
                    ? <span className="flex items-center gap-1 text-xs text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full"><Clock size={10} />{item.durationMinutes}분</span>
                    : <span className="text-white/20 text-xs">-</span>}
                </div>
              ))}
            </div>
          </div>

          {totalMins > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">총 준비 시간</span>
                <span className="text-white font-medium">
                  {totalMins >= 60 ? `${Math.floor(totalMins / 60)}시간 ${totalMins % 60 > 0 ? totalMins % 60 + "분" : ""}` : `${totalMins}분`}
                </span>
              </div>
              {startTimeStr && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">준비 시작 시간</span>
                  <span className="text-yellow-300 font-medium">{startTimeStr}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleReset} className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white/60 rounded-2xl text-sm transition-colors flex items-center justify-center gap-2">
              <RotateCcw size={14} /> 다시 대화하기
            </button>
            <button onClick={() => setAppState("active")} className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <Play size={16} fill="white" /> 지금 시작
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE */}
      {appState === "active" && activeChecklist && (
        <div className="w-full max-w-md space-y-4">
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-2">
              <span>{doneCount}/{totalCount} 완료</span>
              <span>{totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="bg-green-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="space-y-2">
            {activeChecklist.items.map((item, idx) => (
              <button key={item.id} onClick={() => toggleItem(activeChecklist.id, item.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                  item.done ? "bg-green-500/10 border-green-500/20 opacity-60"
                  : idx === doneCount ? "bg-indigo-500/20 border-indigo-400/40 shadow-lg shadow-indigo-500/10"
                  : "bg-white/5 border-white/10"
                }`}>
                {item.done
                  ? <CheckSquare size={20} className="text-green-400 flex-shrink-0" />
                  : <Square size={20} className={`flex-shrink-0 ${idx === doneCount ? "text-indigo-300" : "text-white/30"}`} />}
                <span className={`flex-1 text-sm font-medium ${item.done ? "line-through text-white/40" : "text-white"}`}>
                  {item.text}
                </span>
                {item.durationMinutes && (
                  <span className="text-xs text-white/30 flex items-center gap-0.5">
                    <Clock size={10} />{item.durationMinutes}분
                  </span>
                )}
              </button>
            ))}
          </div>

          {doneCount === totalCount && totalCount > 0 && (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-white font-semibold">모두 완료!</p>
              <p className="text-white/50 text-sm">좋은 하루 보내세요!</p>
            </div>
          )}

          <button onClick={handleReset} className="w-full flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors py-2">
            <RotateCcw size={12} /> 처음으로
          </button>
        </div>
      )}
    </div>
  );
}
