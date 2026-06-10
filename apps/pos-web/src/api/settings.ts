import { request } from "./client";

export async function fetchPublicSiteSettings(): Promise<Record<string, string | null>> {
  try {
    const data = await request<{ settings: Record<string, string | null> }>(
      "/site-settings/public",
    );
    return data.settings ?? {};
  } catch {
    return {};
  }
}
export async function fetchPosQuickNotes(): Promise<string[]> {
  try {
    const settings = await fetchPublicSiteSettings();
    const raw = settings?.pos_quick_notes;
    if (!raw) return [];
    // The site_settings table stores everything as a string; JSON
    // settings are decoded on read here so the rest of the POS can
    // treat the result as a normal array of strings.
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  } catch {
    // Setting hasn't been seeded yet, server unreachable, or JSON is
    // bad. Don't surface — the cashier just doesn't see the picker.
    return [];
  }
}
