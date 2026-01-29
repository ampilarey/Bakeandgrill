type QueueEntry = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "pos_offline_queue";

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

export function enqueue(payload: Record<string, unknown>): QueueEntry {
  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    payload,
  };
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function clearQueue() {
  writeQueue([]);
}
