"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Checklist, ChecklistItem } from "@/types";

const STORAGE_KEY = "outing-prep-checklists";

function loadChecklists(): Checklist[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChecklists(lists: Checklist[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function useChecklist() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadChecklists();
    setChecklists(loaded);
    if (loaded.length > 0) setActiveId(loaded[loaded.length - 1].id);
  }, []);

  const persist = useCallback((updated: Checklist[]) => {
    setChecklists(updated);
    saveChecklists(updated);
  }, []);

  const createChecklistWithItems = useCallback(
    (
      name: string,
      destination: string | undefined,
      eventTime: number | undefined,
      items: { text: string; durationMinutes?: number }[]
    ): Checklist => {
      const checklistItems: ChecklistItem[] = items.map((item, i) => ({
        id: `item-${Date.now()}-${i}`,
        text: item.text,
        done: false,
        durationMinutes: item.durationMinutes,
        durationSource: "ai" as const,
        createdAt: Date.now(),
      }));
      const list: Checklist = {
        id: `cl-${Date.now()}`,
        name,
        destination,
        eventTime,
        items: checklistItems,
        createdAt: Date.now(),
      };
      const updated = [...checklists, list];
      persist(updated);
      setActiveId(list.id);
      return list;
    },
    [checklists, persist]
  );

  const createChecklist = useCallback(
    (name: string, destination?: string, eventTime?: number): Checklist => {
      const list: Checklist = {
        id: `cl-${Date.now()}`,
        name,
        destination,
        eventTime,
        items: [],
        createdAt: Date.now(),
      };
      const updated = [...checklists, list];
      persist(updated);
      setActiveId(list.id);
      return list;
    },
    [checklists, persist]
  );

  const deleteChecklist = useCallback(
    (id: string) => {
      const updated = checklists.filter((c) => c.id !== id);
      persist(updated);
      if (activeId === id) {
        setActiveId(updated.length > 0 ? updated[updated.length - 1].id : null);
      }
    },
    [checklists, persist, activeId]
  );

  const addItem = useCallback(
    (checklistId: string, text: string, category?: string): ChecklistItem => {
      const item: ChecklistItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text,
        done: false,
        category,
        createdAt: Date.now(),
      };
      const updated = checklists.map((c) =>
        c.id === checklistId ? { ...c, items: [...c.items, item] } : c
      );
      persist(updated);
      return item;
    },
    [checklists, persist]
  );

  const toggleItem = useCallback(
    (checklistId: string, itemId: string) => {
      const updated = checklists.map((c) =>
        c.id === checklistId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === itemId ? { ...i, done: !i.done } : i
              ),
            }
          : c
      );
      persist(updated);
    },
    [checklists, persist]
  );

  const removeItem = useCallback(
    (checklistId: string, itemId: string) => {
      const updated = checklists.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.filter((i) => i.id !== itemId) }
          : c
      );
      persist(updated);
    },
    [checklists, persist]
  );

  const updateItemDuration = useCallback(
    (
      checklistId: string,
      itemId: string,
      durationMinutes: number,
      source: "ai" | "user"
    ) => {
      const updated = checklists.map((c) =>
        c.id === checklistId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === itemId
                  ? { ...i, durationMinutes, durationSource: source }
                  : i
              ),
            }
          : c
      );
      persist(updated);
    },
    [checklists, persist]
  );

  const clearDoneItems = useCallback(
    (checklistId: string) => {
      const updated = checklists.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.filter((i) => !i.done) }
          : c
      );
      persist(updated);
    },
    [checklists, persist]
  );

  const activeChecklist = checklists.find((c) => c.id === activeId) ?? null;

  return {
    checklists,
    activeChecklist,
    activeId,
    setActiveId,
    createChecklist,
    createChecklistWithItems,
    deleteChecklist,
    addItem,
    toggleItem,
    removeItem,
    updateItemDuration,
    clearDoneItems,
  };
}
