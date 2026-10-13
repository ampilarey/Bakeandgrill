import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchLabelProducts, updateItemLabel, type LabelProduct } from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { useToast } from '../ui';

/*
 * Choose which menu items get labels, right where the empty list is (round 5
 * of the usability work, owner, 2026-10-13: the audit's "Menu items (0)"
 * with no hint that items must be switched on first). Every menu item with
 * a tick; a tick is saved at once, so Done just closes and the list behind
 * reloads. The same switch as Labels → Settings → Products on labels.
 */
export function ChooseItemsModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<LabelProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    fetchLabelProducts(true).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => (items ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.name_dv ?? '').includes(query.trim())), [items, needle, query]);
  const on = (items ?? []).filter((p) => p.label_enabled).length;

  const toggle = async (p: LabelProduct) => {
    setBusy(p.id);
    try {
      const r = await updateItemLabel(p.id, { label_enabled: !p.label_enabled });
      setItems((list) => (list ?? []).map((x) => (x.id === p.id ? r.data : x)));
      setChanged(true);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : `Could not change ${p.name}.`);
    } finally {
      setBusy(null);
    }
  };
  const done = () => {
    if (changed) onChanged?.();
    onClose();
  };

  return (
    <Modal title="Choose which items get labels" onClose={done} maxWidth={560}>
      <div className="space-y-3" data-testid="choose-items">
        <p className="text-xs text-[var(--color-text-muted)]">Tick an item and it joins the list on Print labels and in Make a label. Its wording, ingredients and pictures are on its Label tab under Menu Items.</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item" aria-label="Find an item" className="h-10 min-h-[44px] pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] w-full" />
        </div>
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]" data-testid="choose-items-count">{items === null ? 'Loading…' : `${on} ${on === 1 ? 'item' : 'items'} on labels`}</p>
        <ul className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] max-h-[50vh] overflow-y-auto" data-testid="choose-items-list">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 px-3 py-1 min-h-[44px] cursor-pointer">
                <input type="checkbox" checked={p.label_enabled} disabled={busy === p.id} onChange={() => void toggle(p)} className="w-5 h-5 shrink-0 accent-[var(--color-primary)]" aria-label={`${p.name} on labels`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-text)]">{p.name}{p.name_dv ? <span dir="rtl" className="ml-2 font-normal text-[var(--color-text-muted)]">{p.name_dv}</span> : null}</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">{p.label_shelf_life_days ? `Keeps ${p.label_shelf_life_days} days` : 'No shelf life yet'} · {p.ingredients?.from === 'recipe' ? 'ingredients from the recipe' : p.ingredients?.from === 'manual' ? 'ingredients typed in' : 'no ingredients yet'}</span>
                </span>
              </label>
            </li>
          ))}
          {items !== null && shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">{items.length === 0 ? 'No menu items yet: add some under Menu Items first.' : 'No item matches.'}</li>}
        </ul>
      </div>
      <ModalActions>
        <Btn onClick={done} data-testid="choose-items-done">Done</Btn>
      </ModalActions>
    </Modal>
  );
}
