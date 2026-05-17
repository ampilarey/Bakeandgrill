type QueueEntry = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "pos_offline_queue";
const LOCK_NAME   = "pos_offline_queue";
const MAX_QUEUE_SIZE = 100;

/**
 * Raised when the offline queue is at capacity. The cashier MUST connect
 * and Sync before taking more orders — silently dropping the oldest order
 * (the previous behaviour) would lose real revenue.
 */
export class OfflineQueueFullError extends Error {
  public readonly size: number;
  constructor(size: number) {
    super(`Offline queue is full (${size} orders).`);
    this.name = "OfflineQueueFullError";
    this.size = size;
  }
}

function readQueue(): QueueEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueueEntry[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function getQueueCount(): number {
  return readQueue().length;
}

export function getQueue(): QueueEntry[] {
  return readQueue();
}

export function setQueue(queue: QueueEntry[]) {
  writeQueue(queue);
}

/**
 * Run a critical-section against the queue, preferring the Web Locks API
 * (so concurrent POS tabs serialise read-modify-write properly) and
 * falling back to a simple Promise chain when navigator.locks isn't
 * available (older browsers, some embedded webviews).
 */
const supportsWebLocks =
  typeof navigator !== "undefined" &&
  typeof (navigator as Navigator & { locks?: LockManager }).locks?.request === "function";

let fallbackChain: Promise<unknown> = Promise.resolve();

function withLock<T>(work: () => T | Promise<T>): Promise<T> {
  if (supportsWebLocks) {
    return navigator.locks.request(LOCK_NAME, async () => work()) as Promise<T>;
  }
  const next = fallbackChain.then(() => work());
  fallbackChain = next.catch(() => undefined);
  return next as Promise<T>;
}

/**
 * Append a payload to the offline queue. Throws OfflineQueueFullError when
 * the cap is reached so the caller can block the cashier with a clear
 * message rather than silently losing orders.
 */
export async function enqueue(payload: Record<string, unknown>): Promise<QueueEntry> {
  return withLock(() => {
    const queue = readQueue();
    if (queue.length >= MAX_QUEUE_SIZE) {
      throw new OfflineQueueFullError(queue.length);
    }
    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      payload,
    };
    queue.push(entry);
    writeQueue(queue);
    return entry;
  });
}

/** Remove and return the oldest entry from the queue, or null if empty. */
export async function dequeue(): Promise<QueueEntry | null> {
  return withLock(() => {
    const queue = readQueue();
    if (queue.length === 0) return null;
    const entry = queue.shift()!;
    writeQueue(queue);
    return entry;
  });
}

export async function clearQueue(): Promise<void> {
  await withLock(() => writeQueue([]));
}
