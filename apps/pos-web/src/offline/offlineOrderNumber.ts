import { getOfflineDb } from "./db";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function deviceShortId(deviceIdentifier: string): string {
  const cleaned = deviceIdentifier.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length <= 6) return cleaned || "POS";
  return cleaned.slice(-6);
}

/**
 * Format: OFF-{deviceShortId}-{YYYYMMDD}-{seq4}
 *
 * FIX 15: the read-increment-write cycle runs in a single IndexedDB
 * readwrite transaction on the meta store so two concurrent allocations
 * from the same device can't mint the same sequence number.
 */
export async function allocateOfflineOrderNumber(deviceIdentifier: string): Promise<string> {
  const date = todayKey();
  const short = deviceShortId(deviceIdentifier);
  const metaKey = `offline_seq:${short}:${date}`;

  const db = await getOfflineDb();
  const tx = db.transaction("meta", "readwrite");
  const store = tx.objectStore("meta");
  const existing = await store.get(metaKey);
  const current = existing?.value ?? null;
  const next =
    (typeof current === "number" ? current : Number(current) || 0) + 1;
  await store.put({ value: next }, metaKey);
  await tx.done;

  const seq = String(next).padStart(4, "0");
  return `OFF-${short}-${date}-${seq}`;
}
