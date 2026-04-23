import { useEffect, useState } from 'react';

export type NotifType = 'order' | 'stock' | 'info' | 'warning';

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  ts: number;
  read: boolean;
}

// Module-level store — survives re-renders, shared across all hook instances
let notifs: AppNotification[] = [];
const subscribers = new Set<() => void>();

function notify() { subscribers.forEach((fn) => fn()); }

export function pushNotification(n: Omit<AppNotification, 'id' | 'ts' | 'read'>): void {
  notifs = [{ ...n, id: Math.random().toString(36).slice(2), ts: Date.now(), read: false }, ...notifs].slice(0, 40);
  notify();
}

export function markAllRead(): void {
  notifs = notifs.map((n) => ({ ...n, read: true }));
  notify();
}

export function clearAll(): void {
  notifs = [];
  notify();
}

export function useNotifications() {
  const [list, setList] = useState<AppNotification[]>(notifs);

  useEffect(() => {
    const handler = () => setList([...notifs]);
    subscribers.add(handler);
    return () => { subscribers.delete(handler); };
  }, []);

  return {
    notifications: list,
    unreadCount: list.filter((n) => !n.read).length,
    markAllRead,
    clearAll,
  };
}
