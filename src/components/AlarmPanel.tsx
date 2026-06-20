"use client";

import { useState } from "react";
import { Alarm } from "@/types";
import { Bell, BellOff, Plus, Trash2, Clock } from "lucide-react";

interface Props {
  alarms: Alarm[];
  pendingAlarms: Alarm[];
  notifPermission: NotificationPermission;
  onRequestPermission: () => void;
  onAddAlarm: (label: string, triggerAt: number, checklistId?: string) => void;
  onRemoveAlarm: (id: string) => void;
  onClearFired: () => void;
}

function formatAlarmTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "지남";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 후`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}시간 ${remMins}분 후` : `${hours}시간 후`;
}

export default function AlarmPanel({
  alarms,
  pendingAlarms,
  notifPermission,
  onRequestPermission,
  onAddAlarm,
  onRemoveAlarm,
  onClearFired,
}: Props) {
  const [label, setLabel] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleAdd = () => {
    if (!label.trim() || !dateTime) return;
    const ts = new Date(dateTime).getTime();
    if (isNaN(ts) || ts <= Date.now()) {
      alert("미래 시간을 선택해 주세요");
      return;
    }
    onAddAlarm(label.trim(), ts);
    setLabel("");
    setDateTime("");
    setShowForm(false);
  };

  const minDateTime = new Date(Date.now() + 60000)
    .toISOString()
    .slice(0, 16);

  const firedAlarms = alarms.filter((a) => a.fired);

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">알람</h2>
        <div className="flex items-center gap-2">
          {notifPermission !== "granted" && (
            <button
              onClick={onRequestPermission}
              className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-xs text-yellow-300 transition-colors"
            >
              <BellOff size={11} />
              알림 허용
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-2 py-1 bg-indigo-500/30 hover:bg-indigo-500/50 rounded-lg text-xs text-indigo-200 transition-colors"
          >
            <Plus size={12} />
            추가
          </button>
        </div>
      </div>

      {notifPermission === "granted" && (
        <div className="flex items-center gap-1 text-xs text-green-400 mb-3">
          <Bell size={11} />
          알림이 활성화되어 있어요
        </div>
      )}

      {showForm && (
        <div className="space-y-2 mb-4 p-3 bg-white/5 rounded-xl">
          <input
            type="text"
            placeholder="알람 이름 (예: 출발 30분 전)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-indigo-400"
          />
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            min={minDateTime}
            className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-indigo-400 [color-scheme:dark]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              설정
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-2 bg-white/10 text-white/60 rounded-lg text-sm hover:bg-white/20 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {pendingAlarms.length === 0 && firedAlarms.length === 0 && (
          <p className="text-white/30 text-sm text-center py-4">
            알람이 없어요 ⏰
          </p>
        )}

        {pendingAlarms.map((alarm) => (
          <div
            key={alarm.id}
            className="flex items-start gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl"
          >
            <Clock size={16} className="text-indigo-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{alarm.label}</p>
              <p className="text-xs text-white/50">{formatAlarmTime(alarm.triggerAt)}</p>
              <p className="text-xs text-indigo-300">{timeUntil(alarm.triggerAt)}</p>
            </div>
            <button
              onClick={() => onRemoveAlarm(alarm.id)}
              className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {firedAlarms.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <p className="text-xs text-white/30">지난 알람</p>
              <button
                onClick={onClearFired}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                모두 지우기
              </button>
            </div>
            {firedAlarms.map((alarm) => (
              <div
                key={alarm.id}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-xl opacity-50 mb-1"
              >
                <Bell size={14} className="text-white/30" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 truncate">{alarm.label}</p>
                  <p className="text-xs text-white/30">{formatAlarmTime(alarm.triggerAt)}</p>
                </div>
                <button
                  onClick={() => onRemoveAlarm(alarm.id)}
                  className="text-white/20 hover:text-red-400/60 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
