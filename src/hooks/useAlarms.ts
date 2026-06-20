"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Alarm } from "@/types";

const STORAGE_KEY = "outing-prep-alarms";

function loadAlarms(): Alarm[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAlarms(alarms: Alarm[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
}

export function useAlarms() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const loaded = loadAlarms();
    setAlarms(loaded);
    if (typeof Notification !== "undefined") {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const requestNotifPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  }, []);

  const fireAlarm = useCallback((alarm: Alarm) => {
    const speak = (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    };

    const message = `${alarm.label} - 외출 준비할 시간이에요!`;

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("외출 준비 알림 ⏰", {
        body: message,
        icon: "/favicon.ico",
        tag: alarm.id,
      });
    }

    speak(message);

    setAlarms((prev) => {
      const updated = prev.map((a) =>
        a.id === alarm.id ? { ...a, fired: true } : a
      );
      saveAlarms(updated);
      return updated;
    });
  }, []);

  const scheduleAlarm = useCallback(
    (alarm: Alarm) => {
      const delay = alarm.triggerAt - Date.now();
      if (delay <= 0 || alarm.fired) return;

      const existing = timersRef.current.get(alarm.id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        fireAlarm(alarm);
        timersRef.current.delete(alarm.id);
      }, delay);

      timersRef.current.set(alarm.id, timer);
    },
    [fireAlarm]
  );

  useEffect(() => {
    alarms.forEach((alarm) => {
      if (!alarm.fired && alarm.triggerAt > Date.now()) {
        scheduleAlarm(alarm);
      }
    });
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const addAlarm = useCallback(
    (label: string, triggerAt: number, checklistId?: string): Alarm => {
      const alarm: Alarm = {
        id: `alarm-${Date.now()}`,
        label,
        triggerAt,
        checklistId,
        fired: false,
      };
      const updated = [...alarms, alarm];
      setAlarms(updated);
      saveAlarms(updated);
      scheduleAlarm(alarm);
      return alarm;
    },
    [alarms, scheduleAlarm]
  );

  const removeAlarm = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      const updated = alarms.filter((a) => a.id !== id);
      setAlarms(updated);
      saveAlarms(updated);
    },
    [alarms]
  );

  const clearFiredAlarms = useCallback(() => {
    const updated = alarms.filter((a) => !a.fired);
    setAlarms(updated);
    saveAlarms(updated);
  }, [alarms]);

  const pendingAlarms = alarms.filter(
    (a) => !a.fired && a.triggerAt > Date.now()
  );

  return {
    alarms,
    pendingAlarms,
    notifPermission,
    requestNotifPermission,
    addAlarm,
    removeAlarm,
    clearFiredAlarms,
  };
}
