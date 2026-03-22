type QueueEntry = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "pos_offline_queue";
const LOCK_NAME   = "pos_offline_queue";

function readQueue(): QueueEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
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

const MAX_QUEUE_SIZE = 100;

/**
 * Append a payload to the offline queue.
 * Uses the Web Locks API to serialize concurrent access from multiple POS tabs
 * so no entries are lost in a read-modify-write race.
 */
export async function enqueue(payload: Record<string, unknown>): Promise<QueueEntry> {
  return navigator.locks.request(LOCK_NAME, () => {
    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      payload,
    };
    const queue = readQueue();
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn(`[offlineQueue] Queue full (${MAX_QUEUE_SIZE} entries). Oldest entry dropped.`);
      queue.shift();
    }
    queue.push(entry);
    writeQueue(queue);
    return entry;
  });
}

/** Remove and return the oldest entry from the queue, or null if empty. */
export async function dequeue(): Promise<QueueEntry | null> {
  return navigator.locks.request(LOCK_NAME, () => {
    const queue = readQueue();
    if (queue.length === 0) return null;
    const entry = queue.shift()!;
    writeQueue(queue);
    return entry;
  });
}

export async function clearQueue(): Promise<void> {
  return navigator.locks.request(LOCK_NAME, () => {
    writeQueue([]);
  });
}
