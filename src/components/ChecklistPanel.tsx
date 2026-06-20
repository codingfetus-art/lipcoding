"use client";

import { useState } from "react";
import { Checklist, ChecklistItem } from "@/types";
import { Plus, Trash2, CheckSquare, Square, X, Clock, Sparkles, Calendar } from "lucide-react";

interface Props {
  checklists: Checklist[];
  activeChecklist: Checklist | null;
  activeId: string | null;
  onSetActive: (id: string) => void;
  onCreateChecklist: (name: string, destination?: string, eventTime?: number) => void;
  onDeleteChecklist: (id: string) => void;
  onAddItem: (checklistId: string, text: string, category?: string) => void;
  onToggleItem: (checklistId: string, itemId: string) => void;
  onRemoveItem: (checklistId: string, itemId: string) => void;
  onUpdateDuration: (checklistId: string, itemId: string, minutes: number, source: "ai" | "user") => void;
  onClearDone: (checklistId: string) => void;
  onRequestAiDuration: (checklistId: string, itemId: string, itemText: string) => void;
}

function formatEventTime(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcStartTime(eventTime: number, totalMinutes: number): string {
  const startTs = eventTime - totalMinutes * 60 * 1000;
  const now = Date.now();
  const diffMs = startTs - now;
  const timeStr = new Date(startTs).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffMs < 0) return `${timeStr} (이미 지남)`;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${timeStr} (${diffMin}분 후)`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${timeStr} (${h}시간 ${m > 0 ? m + "분 " : ""}후)`;
}

export default function ChecklistPanel({
  checklists,
  activeChecklist,
  activeId,
  onSetActive,
  onCreateChecklist,
  onDeleteChecklist,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onUpdateDuration,
  onClearDone,
  onRequestAiDuration,
}: Props) {
  const [newName, setNewName] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [durationInput, setDurationInput] = useState("");

  const handleCreateChecklist = () => {
    if (!newName.trim()) return;
    const ts = newEventTime ? new Date(newEventTime).getTime() : undefined;
    onCreateChecklist(newName.trim(), newDest.trim() || undefined, ts);
    setNewName("");
    setNewDest("");
    setNewEventTime("");
    setShowNewForm(false);
  };

  const handleAddItem = () => {
    if (!newItemText.trim() || !activeId) return;
    onAddItem(activeId, newItemText.trim());
    setNewItemText("");
  };

  const handleSaveDuration = (itemId: string) => {
    const mins = parseInt(durationInput, 10);
    if (!isNaN(mins) && mins > 0 && activeId) {
      onUpdateDuration(activeId, itemId, mins, "user");
    }
    setEditingDurationId(null);
    setDurationInput("");
  };

  const pendingItems = activeChecklist?.items.filter((i) => !i.done) ?? [];
  const doneItems = activeChecklist?.items.filter((i) => i.done) ?? [];
  const totalItems = activeChecklist?.items.length ?? 0;
  const doneCount = doneItems.length;
  const progress = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;

  const totalDurationMinutes = (activeChecklist?.items ?? []).reduce(
    (sum, i) => sum + (i.durationMinutes ?? 0),
    0
  );

  const minEventTime = new Date(Date.now() + 60000).toISOString().slice(0, 16);

  const renderItem = (item: ChecklistItem) => (
    <div
      key={item.id}
      className={`rounded-xl border transition-all ${
        item.done
          ? "bg-white/3 border-white/5 opacity-50"
          : "bg-white/5 border-white/10 hover:border-white/20"
      }`}
    >
      {/* Item row */}
      <div className="flex items-center gap-2 p-2.5">
        <button
          onClick={() => onToggleItem(activeChecklist!.id, item.id)}
          className="flex-shrink-0 text-white/50 hover:text-green-400 transition-colors"
        >
          {item.done ? (
            <CheckSquare size={17} className="text-green-400" />
          ) : (
            <Square size={17} />
          )}
        </button>

        <span
          className={`flex-1 text-sm leading-snug ${
            item.done ? "line-through text-white/30" : "text-white"
          }`}
        >
          {item.text}
        </span>

        {/* Duration badge / edit */}
        {editingDurationId === item.id ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              min={1}
              max={999}
              placeholder="분"
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDuration(item.id);
                if (e.key === "Escape") {
                  setEditingDurationId(null);
                  setDurationInput("");
                }
              }}
              className="w-14 text-center bg-white/10 text-white text-xs rounded-lg px-2 py-1 border border-indigo-400 focus:outline-none"
            />
            <span className="text-xs text-white/40">분</span>
            <button
              onClick={() => handleSaveDuration(item.id)}
              className="text-xs text-green-400 hover:text-green-300 px-1"
            >
              ✓
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {item.durationMinutes ? (
              <button
                onClick={() => {
                  setEditingDurationId(item.id);
                  setDurationInput(String(item.durationMinutes));
                }}
                className={`flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full transition-colors ${
                  item.durationSource === "ai"
                    ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                    : "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                }`}
                title={item.durationSource === "ai" ? "AI 예측 (클릭해서 수정)" : "직접 입력 (클릭해서 수정)"}
              >
                <Clock size={10} />
                {item.durationMinutes}분
                {item.durationSource === "ai" && <Sparkles size={9} className="ml-0.5" />}
              </button>
            ) : (
              <button
                onClick={() => {
                  setEditingDurationId(item.id);
                  setDurationInput("");
                }}
                className="text-xs text-white/20 hover:text-white/50 px-1.5 py-0.5 rounded-full hover:bg-white/5 transition-colors"
                title="소요 시간 입력"
              >
                <Clock size={11} />
              </button>
            )}

            {/* AI duration predict */}
            {!item.done && (
              <button
                onClick={() => onRequestAiDuration(activeChecklist!.id, item.id, item.text)}
                className="text-xs text-white/20 hover:text-purple-400 px-1 transition-colors"
                title="AI에게 시간 예측 요청"
              >
                <Sparkles size={11} />
              </button>
            )}

            {/* Delete — always visible */}
            <button
              onClick={() => onRemoveItem(activeChecklist!.id, item.id)}
              className="text-white/25 hover:text-red-400 transition-colors px-1"
              title="삭제"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">체크리스트</h2>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="flex items-center gap-1 px-2 py-1 bg-indigo-500/30 hover:bg-indigo-500/50 rounded-lg text-xs text-indigo-200 transition-colors"
          >
            <Plus size={12} />
            새 일정
          </button>
        </div>

        {/* New checklist form */}
        {showNewForm && (
          <div className="space-y-2 mb-3 p-3 bg-white/5 rounded-xl border border-white/10">
            <input
              type="text"
              placeholder="일정 이름 (예: 면접, 데이트, 여행)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateChecklist()}
              className="w-full bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-indigo-400"
            />
            <input
              type="text"
              placeholder="목적지 (선택)"
              value={newDest}
              onChange={(e) => setNewDest(e.target.value)}
              className="w-full bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-indigo-400"
            />
            <div>
              <label className="text-xs text-white/40 mb-1 block flex items-center gap-1">
                <Calendar size={10} />
                약속 시간 (선택 — 역산 알람에 사용돼요)
              </label>
              <input
                type="datetime-local"
                value={newEventTime}
                onChange={(e) => setNewEventTime(e.target.value)}
                min={minEventTime}
                className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-indigo-400 [color-scheme:dark]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreateChecklist}
                className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                만들기
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white/60 rounded-lg text-sm transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        {checklists.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {checklists.map((c) => (
              <button
                key={c.id}
                onClick={() => onSetActive(c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeId === c.id
                    ? "bg-indigo-500 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active checklist body */}
      {activeChecklist ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Meta + progress */}
          <div className="px-5 pt-4 pb-3 space-y-3">
            {/* Event info row */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-white/40">
              {activeChecklist.destination && (
                <span>📍 {activeChecklist.destination}</span>
              )}
              {activeChecklist.eventTime && (
                <span className="flex items-center gap-1 text-indigo-300">
                  <Calendar size={10} />
                  {formatEventTime(activeChecklist.eventTime)}
                </span>
              )}
            </div>

            {/* Duration summary + start time */}
            {totalDurationMinutes > 0 && (
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 flex items-center gap-1">
                    <Clock size={11} />
                    총 예상 준비 시간:
                    <span className="text-indigo-300 font-semibold ml-1">
                      {totalDurationMinutes >= 60
                        ? `${Math.floor(totalDurationMinutes / 60)}시간 ${totalDurationMinutes % 60 > 0 ? (totalDurationMinutes % 60) + "분" : ""}`
                        : `${totalDurationMinutes}분`}
                    </span>
                  </span>
                </div>
                {activeChecklist.eventTime && (
                  <div className="mt-1.5 text-white/50">
                    🏁 준비 시작 시간:{" "}
                    <span className="text-yellow-300 font-medium">
                      {calcStartTime(activeChecklist.eventTime, totalDurationMinutes)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Progress bar */}
            {totalItems > 0 && (
              <div>
                <div className="flex justify-between text-xs text-white/40 mb-1">
                  <span>{doneCount}/{totalItems} 완료</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div
                    className="bg-green-400 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Add item input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="항목 추가... (Enter)"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-indigo-400"
              />
              <button
                onClick={handleAddItem}
                disabled={!newItemText.trim()}
                className="px-3 py-2 bg-indigo-500/40 hover:bg-indigo-500/60 disabled:opacity-30 text-white rounded-xl transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-1.5">
            {activeChecklist.items.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-6">
                항목을 추가하거나 AI에게 추천받아 보세요 ✨
              </p>
            ) : (
              <>
                {pendingItems.map(renderItem)}
                {doneItems.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-white/25 mb-1.5 px-1">완료됨</p>
                    {doneItems.map(renderItem)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
            {doneCount > 0 && (
              <button
                onClick={() => onClearDone(activeChecklist.id)}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                완료 항목 지우기
              </button>
            )}
            <button
              onClick={() => onDeleteChecklist(activeChecklist.id)}
              className="ml-auto flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors"
            >
              <Trash2 size={11} />
              일정 삭제
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <p className="text-4xl mb-3">📋</p>
            <p className="text-white/40 text-sm">새 일정을 만들거나</p>
            <p className="text-white/40 text-sm">AI에게 도움을 요청해 보세요</p>
          </div>
        </div>
      )}
    </div>
  );
}
