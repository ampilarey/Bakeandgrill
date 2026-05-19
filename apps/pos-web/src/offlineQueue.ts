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

const CORRUPT_BACKUP_KEY = "pos_offline_queue.corrupt";

/**
 * Read + validate the queue. Anything malformed (bad JSON, not an array,
 * entries missing id/createdAt/payload) is treated as corruption: the
 * raw value is moved to a sibling key for forensic review so we don't
 * silently destroy queued orders, and an empty queue is returned so
 * the POS can continue operating.
 *
 * Pre-fix this was `JSON.parse → return []` with no validation — a
 * single corrupt entry would cause the entire queue to silently
 * disappear with no audit trail.
 */
function readQueue(): QueueEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("not an array");
    }
    const valid: QueueEntry[] = [];
    for (const entry of parsed) {
      if (
        entry
        && typeof entry === "object"
        && typeof (entry as QueueEntry).id === "string"
        && typeof (entry as QueueEntry).createdAt === "string"
        && (entry as QueueEntry).payload
      ) {
        valid.push(entry as QueueEntry);
      }
    }
    // If we dropped entries during validation, preserve the original
    // raw value so an operator can recover orders manually.
    if (valid.length !== parsed.length) {
      try { localStorage.setItem(CORRUPT_BACKUP_KEY, raw); } catch { /* quota */ }
    }
    return valid;
  } catch {
    try { localStorage.setItem(CORRUPT_BACKUP_KEY, raw); } catch { /* quota */ }
    return [];
  }
}

function writeQueue(queue: QueueEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  cachedCount = queue.length;
}

/**
 * Bug-045: `getQueueCount` is called on every render of the cart
 * status banner / sync button, which used to re-parse the entire
 * localStorage JSON each time. On a queue with 50+ stored orders
 * that meant ~50 KiB of JSON parsing per frame — measurable
 * jank on iPad Mini. Now we cache the count and invalidate it
 * on every write (enqueue, dequeue, clearQueue, setQueue) plus
 * on cross-tab `storage` events from another POS window.
 */
let cachedCount: number | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) cachedCount = null;
  });
}

export function getQueueCount(): number {
  if (cachedCount === null) cachedCount = readQueue().length;
  return cachedCount;
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
