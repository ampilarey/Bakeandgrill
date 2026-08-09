import { req } from './client';

// ── POS close-shift currency photos ──────────────────────────────────────────
// Face values are integer laari (1 MVR = 100 laari). A custom photo overrides
// the thumbnail bundled with the POS; deleting it reverts to the bundle.

export const CURRENCY_FACES: { face: number; label: string; kind: 'note' | 'coin' }[] = [
  { face: 100_000, label: 'MVR 1000', kind: 'note' },
  { face: 50_000, label: 'MVR 500', kind: 'note' },
  { face: 10_000, label: 'MVR 100', kind: 'note' },
  { face: 5_000, label: 'MVR 50', kind: 'note' },
  { face: 2_000, label: 'MVR 20', kind: 'note' },
  { face: 1_000, label: 'MVR 10', kind: 'note' },
  { face: 500, label: 'MVR 5', kind: 'note' },
  { face: 200, label: 'MVR 2', kind: 'coin' },
  { face: 100, label: 'MVR 1', kind: 'coin' },
  { face: 50, label: '50 laari', kind: 'coin' },
  { face: 25, label: '25 laari', kind: 'coin' },
  { face: 20, label: '20 laari', kind: 'coin' },
  { face: 10, label: '10 laari', kind: 'coin' },
  { face: 5, label: '5 laari', kind: 'coin' },
  { face: 2, label: '2 laari', kind: 'coin' },
  { face: 1, label: '1 laari', kind: 'coin' },
];

export async function getCurrencyImages(): Promise<{ images: Record<string, string> }> {
  return req('/currency-images');
}

export async function uploadCurrencyImage(face: number, file: File): Promise<{ url: string }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const prepared = await prepareImageForUpload(file);
  const form = new FormData();
  form.append('file', prepared);
  return req(`/admin/currency-images/${face}`, { method: 'POST', body: form });
}

export async function resetCurrencyImage(face: number): Promise<void> {
  await req(`/admin/currency-images/${face}`, { method: 'DELETE' });
}
