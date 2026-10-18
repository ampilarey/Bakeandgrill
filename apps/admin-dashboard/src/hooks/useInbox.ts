import { useEffect, useState } from 'react';
import { fetchInbox, type InboxRow } from '../api';

/** The "Needs attention" rows, refreshed every minute (feature 14). */
export function useInbox(): { rows: InboxRow[]; total: number; loaded: boolean } {
  const [state, setState] = useState<{ rows: InboxRow[]; total: number; loaded: boolean }>({ rows: [], total: 0, loaded: false });
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetchInbox();
        if (live) setState({ rows: r.rows ?? [], total: r.total ?? 0, loaded: true });
      } catch {
        if (live) setState((s) => ({ ...s, loaded: true }));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  return state;
}
