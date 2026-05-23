import { getMetaValue, setMetaValue } from "./db";

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
 */
export async function allocateOfflineOrderNumber(deviceIdentifier: string): Promise<string> {
  const date = todayKey();
  const metaKey = `offline_seq:${deviceShortId(deviceIdentifier)}:${date}`;
  const current = await getMetaValue(metaKey);
  const next = (typeof current === "number" ? current : Number(current) || 0) + 1;
  await setMetaValue(metaKey, next);
  const seq = String(next).padStart(4, "0");
  return `OFF-${deviceShortId(deviceIdentifier)}-${date}-${seq}`;
}
