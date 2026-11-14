import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Layers, ListChecks, Pencil, Plus, Printer, Search, Tag } from 'lucide-react';
import { fetchLabelProducts, type LabelProduct } from '../../api';
import { Button, Card } from '../ui';
import { Modal } from '../SharedUI';
import { ChooseItemsModal } from './ChooseItemsModal';
import { CustomLabelsTab } from './CustomLabels';
import { ExpiringStock } from './ExpiringStock';
import { ItemLabelTab } from './ItemLabelTab';
import { PrintLabelModal, type PrintTarget } from './PrintLabelModal';
import { ReprintScan } from './ReprintScan';

/*
 * My labels (owner, 2026-11-14: "Still i feel saving, printing ect of labels are confusing"). One list of every
 * label there is, each row with Print and Edit: the labels for things not on the menu, then the menu items that
 * print labels. Print opens the one pop-up with the dates (PrintLabelModal); Edit opens the label. The sheets
 * printed before and the print log fold beneath, and the full Print labels form, for several products on one
 * sheet, is one button away. Custom labels and Saved labels were tabs of their own until now.
 */

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';

/** A menu item as the Print pop-up needs it. */
export const itemPrintTarget = (p: LabelProduct): PrintTarget => ({
  kind: 'item', id: p.id, name: p.name, lang: p.name_dv ? 'both' : 'en',
  pouch: Boolean(p.label_pouch), faces: p.label_wrap?.faces ?? 0,
  sizes: p.sizes?.map((z) => ({ id: z.id, name: z.name, price: z.price })), ownQty: p.label_pack_qty ?? null,
});

/** The menu items switched on for labels, each to print or edit. */
function MenuItemLabels({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<LabelProduct[] | null>(null);
  const [query, setQuery] = useState('');
  const [print, setPrint] = useState<LabelProduct | null>(null);
  const [edit, setEdit] = useState<LabelProduct | null>(null);
  const [choose, setChoose] = useState(false);
  const load = () => fetchLabelProducts().then((r) => setRows(r.data.filter((p) => p.label_enabled !== false))).catch(() => setRows([]));
  useEffect(() => { void load(); }, []);
  const needle = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.name_dv ?? '').includes(query.trim()));

  return (
    <Card
      padding="none"
      header={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-bold text-[var(--color-text)]">Menu items</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">The dishes that print labels. The name, price and ingredients come from the menu.</p>
            </div>
            {canManage && <Button size="sm" variant="secondary" icon={<ListChecks size={16} />} onClick={() => setChoose(true)} data-testid="my-labels-choose">Choose which items get labels</Button>}
          </div>
          {(rows?.length ?? 0) >= 4 && (
            <label className="relative block max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a menu item" aria-label="Find a menu item label" className={`${fieldClass} pl-9`} />
            </label>
          )}
        </div>
      }
    >
      <ul className="divide-y divide-[var(--color-border-light)]" data-testid="my-labels-items">
        {shown.map((p) => (
          <li key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="w-12 h-12 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
              {p.label_photo_url ? <img src={p.label_photo_url} alt="" className="max-w-full max-h-full object-contain" /> : <Tag size={18} className="text-[var(--color-text-muted)]" />}
            </div>
            <div className="flex-1 min-w-[160px]">
              <div className="text-sm font-semibold text-[var(--color-text)]">{p.name}{p.name_dv ? <span className="ml-2 font-normal text-[var(--color-text-muted)]" dir="rtl">{p.name_dv}</span> : null}</div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {(p.label_shelf_life_days ?? p.defaults?.shelf_life_days) ? `Keeps ${p.label_shelf_life_days ?? p.defaults?.shelf_life_days} days` : 'No shelf life set'}
                {(p.sizes?.length ?? 0) > 0 ? ` · ${p.sizes!.length} sizes` : ''}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 ml-auto">
              <Button size="sm" icon={<Printer size={14} />} onClick={() => setPrint(p)} aria-label={`Print ${p.name}`} data-testid={`item-print-${p.id}`}>Print</Button>
              {canManage && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(p)} aria-label={`Edit ${p.name}`}>Edit</Button>}
            </div>
          </li>
        ))}
        {rows !== null && rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">{canManage ? 'No menu item prints labels yet. Press Choose which items get labels.' : 'No menu item prints labels yet.'}</li>
        )}
        {rows !== null && rows.length > 0 && shown.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No item matches “{query.trim()}”.</li>
        )}
      </ul>
      {print && <PrintLabelModal target={itemPrintTarget(print)} canManage={canManage} onClose={() => setPrint(null)} />}
      {edit && (
        <Modal title={`${edit.name}: label details`} onClose={() => { setEdit(null); void load(); }} maxWidth={900}>
          <ItemLabelTab itemId={edit.id} />
        </Modal>
      )}
      {choose && <ChooseItemsModal onClose={() => { setChoose(false); void load(); }} onChanged={() => void load()} />}
    </Card>
  );
}

/** A fold with a title and a one-line hint, closed until tapped. */
function Fold({ title, hint, open = false, testId, children }: { title: string; hint: string; open?: boolean; testId?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" open={open} data-testid={testId}>
      <summary className="list-none cursor-pointer min-h-[52px] px-4 py-2 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--color-text)]">{title}</span>
          <span className="block text-xs text-[var(--color-text-muted)]">{hint}</span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-[var(--color-text-muted)] group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

export function MyLabelsTab({ canManage, printedBefore, openPrinted = false }: {
  canManage: boolean;
  /** The sheets printed before, with the print log (the hub's own list). */
  printedBefore: ReactNode;
  /** Opened from an old Saved labels address: the fold starts open. */
  openPrinted?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5" data-testid="my-labels">
      <ExpiringStock />
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<Plus size={16} />} onClick={() => navigate('/labels/make')} data-testid="my-labels-new">New label</Button>
        <Button variant="secondary" icon={<Layers size={16} />} onClick={() => navigate('/labels/stickers')} data-testid="my-labels-several">Print several on one sheet</Button>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)] -mt-2">Tap <strong>Print</strong> on a label to set how many and its dates, then print. Tap <strong>Edit</strong> to change the label itself.</p>
      <CustomLabelsTab canManage={canManage} />
      <MenuItemLabels canManage={canManage} />
      <Fold title="Scan a pack to print its sticker again" hint="Scan the QR on a pack, or type its code." testId="my-labels-scan">
        <ReprintScan />
      </Fold>
      <Fold title="Sheets printed before" hint="Every sheet printed, to print again, download, rename or pin. The print log is beneath." open={openPrinted} testId="my-labels-printed">
        {printedBefore}
      </Fold>
    </div>
  );
}
