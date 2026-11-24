import { useEffect, useState } from 'react';
import { fetchAiStatus, type AiFeature, type AiStatus } from '../../api/ai';

/**
 * Which assistant buttons to show. Asked once for the whole admin and shared, since a
 * page may hold a dozen Dhivehi boxes; the settings card calls refreshAi() after a save.
 * Until it answers, and when it fails, no button shows: the page works as it always did.
 */
let cached: AiStatus | null = null;
let asking: Promise<AiStatus | null> | null = null;
const listeners = new Set<(s: AiStatus | null) => void>();

function ask(): Promise<AiStatus | null> {
  asking ??= fetchAiStatus()
    .then((s) => { cached = s; return s; })
    .catch(() => null)
    .then((s) => { listeners.forEach((l) => l(s)); return s; });
  return asking;
}

export function refreshAi(): void {
  asking = null;
  void ask();
}

/** For tests: forget what was asked. */
export function resetAi(status: AiStatus | null = null): void {
  cached = status;
  asking = status ? Promise.resolve(status) : null;
}

export function useAi(feature: AiFeature): boolean {
  const [status, setStatus] = useState<AiStatus | null>(cached);
  useEffect(() => {
    listeners.add(setStatus);
    void ask().then((s) => setStatus(s));
    return () => { listeners.delete(setStatus); };
  }, []);
  return status?.features?.[feature] === true;
}
