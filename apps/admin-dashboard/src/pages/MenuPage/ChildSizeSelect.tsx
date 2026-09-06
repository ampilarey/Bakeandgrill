/**
 * "Which size?" for a bundle or platter child sold in sizes.
 *
 * Menu-item stock audit, 2026-09-07 (finding 6): a bundle could name "Coke"
 * with no size, so the ticket said Coke, the size-level stock never moved and
 * the contents price used the cheapest size. The server now refuses a sized
 * child without a size; this is where the owner picks one.
 *
 * A child already saved with a size, opened again, knows its size name but
 * not the other sizes — those are fetched on demand so the dropdown can
 * still change it.
 */
import { useEffect, useState } from 'react';
import { fetchAdminItems } from '../../api';
import type { MenuItemSelection } from '../../components/ItemSearch';
import type { ChildSizeOption } from './menuItemForm';

type Row = {
  item_id: string;
  item_name?: string;
  variant_id?: string;
  variant_name?: string;
  size_options?: ChildSizeOption[];
};

export function sizeOptionsFromSelection(sel: MenuItemSelection | null): ChildSizeOption[] {
  if (!sel || !sel.item.has_variants) return [];
  return (sel.item.variants ?? [])
    .filter((v) => v.id != null && v.is_active !== false)
    .map((v) => ({ id: v.id as number, name: v.name }));
}

export function ChildSizeSelect({
  row,
  testId,
  onChange,
}: {
  row: Row;
  testId: string;
  onChange: (variantId: string, variantName: string | undefined) => void;
}) {
  const [fetched, setFetched] = useState<ChildSizeOption[] | null>(null);
  const known = row.size_options ?? fetched;
  // A saved size with no option list yet: this child is sized, go and ask.
  const needsFetch = !row.size_options && !!row.variant_id && fetched === null && row.item_id !== '';

  useEffect(() => {
    if (!needsFetch) return;
    let alive = true;
    const id = Number(row.item_id);
    fetchAdminItems({ search: row.item_name || undefined, page: 1, per_page: 50 })
      .then((res) => {
        if (!alive) return;
        const item = (res.data ?? []).find((i) => i.id === id);
        setFetched(item
          ? (item.variants ?? []).filter((v) => v.id != null && v.is_active !== false).map((v) => ({ id: v.id as number, name: v.name }))
          : []);
      })
      .catch(() => { if (alive) setFetched([]); });
    return () => { alive = false; };
  }, [needsFetch, row.item_id, row.item_name]);

  // Sizeless child, or nothing chosen yet: nothing to ask.
  if (!row.variant_id && (!known || known.length === 0)) return null;

  const options = known && known.length > 0
    ? known
    : row.variant_id
      ? [{ id: Number(row.variant_id), name: row.variant_name ?? `Size #${row.variant_id}` }]
      : [];

  return (
    <div style={{ marginTop: 8, maxWidth: 240 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        Which size
      </label>
      <select
        data-testid={testId}
        value={row.variant_id ?? ''}
        onChange={(e) => {
          const picked = options.find((o) => String(o.id) === e.target.value);
          onChange(e.target.value, picked?.name);
        }}
        style={{
          width: '100%', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-border)',
          padding: '6px 10px', fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-text)',
        }}
      >
        <option value="">— pick a size —</option>
        {options.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
      </select>
    </div>
  );
}
