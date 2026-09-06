import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  PageHeader, PageShell, TableCard, TH, TD, Badge, Btn, Modal, ModalActions,
  EmptyState, StatCard, useConfirmDialog, ConfirmDialog, TableSkeleton, TableStateBar,
} from '../components/SharedUI';
import { downloadCSV } from '../utils/csvExport';
import { planShelfLabels, shelfLabelsHtml } from '../utils/shelfLabels';
import { ScanSheet } from '../components/ScanSheet';
import {
  fetchInventoryItems, fetchLowStockItems, adjustInventoryStock,
  fetchInventoryCategories, createInventoryCategory, updateInventoryCategory,
  getUnitConversions, createUnitConversion, deleteUnitConversion,
  getInventoryPriceHistory, getInventoryCheapestSupplier, submitStockCount,
  fetchPreparedStock, adjustPreparedStock, createInventoryItem,
  fetchInventoryItemDetail, fetchSuppliers, updateInventoryItem,
  getPurchaseUnits, createPurchaseUnit, deletePurchaseUnit,
  type InventoryItem, type InventoryCategory, type UnitConversion,
  type InventoryPriceHistoryEntry, type CheapestSupplier, type PreparedStockRow,
  type StockMovementRow, type Supplier,
  type InventoryPurchaseUnit,
} from '../api';

// Waste used to be its own sidebar entry. It is a stock question — what left
// the shelf without being sold — so it lives here now (purchasing audit,
// 2026-09-05). Lazy so the Inventory bundle does not carry it until opened.
const WasteLogsPage = lazy(() => import('./WasteLogsPage'));

type InventoryTab = 'stock' | 'prepared' | 'categories' | 'conversions' | 'stock-count' | 'waste';
const INVENTORY_TABS: readonly InventoryTab[] = ['stock', 'prepared', 'categories', 'conversions', 'stock-count', 'waste'];

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: 'var(--color-text-secondary)', marginBottom: 4 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
  }),
};

export default function InventoryPage() {
  usePageTitle('Inventory');
  const { can } = useCurrentUserPermissions();
  const isMobile = useIsMobile();
  const canManage = can('inventory.manage');
  const canPrepared = can('menu.prepared_stock') || canManage;
  const canCategories = can('inventory.categories') || canManage;
  // `?tab=` opens a tab directly (the old /waste-logs URL redirects to
  // /inventory?tab=waste); switching tabs afterwards is local state only.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<InventoryTab>(() => {
    const t = searchParams.get('tab');
    return t && (INVENTORY_TABS as readonly string[]).includes(t) ? (t as InventoryTab) : 'stock';
  });

  // ── Stock tab ──────────────────────────────────────────────────────────────
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowCount, setLowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjForm, setAdjForm] = useState({ type: 'add' as 'add' | 'remove' | 'set', quantity: '', reason: '' });
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [quickAdjusting, setQuickAdjusting] = useState<Record<number, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [scanBarcode, setScanBarcode] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', sku: '', barcode: '', unit: 'kg', current_stock: '', reorder_point: '', lead_days: '', cover_days: '', unit_cost: '',
    inventory_category_id: '', preferred_supplier_id: '', storage_location: '', notes: '',
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  /*
   * Pack sizes: how an item is bought, as opposed to how it is counted. Eggs
   * are counted in pieces and bought by the tray or the case. Defining them
   * here is what lets a purchase say "1 case" and have the shelf gain 210.
   */
  const [packs, setPacks] = useState<InventoryPurchaseUnit[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState('');
  const [packForm, setPackForm] = useState({ name: '', qty: '', ofPackId: '' });
  const [packSaving, setPackSaving] = useState(false);

  /*
   * Owner, 2026-09-06: "i dont see pack size". It lived behind an unlabelled
   * 📦 among five other emoji buttons on the row, so the feature may as well
   * not have existed. It is a named section of Edit item now, next to the
   * unit it is measured against — the one field it only makes sense beside.
   */
  const loadPacks = async (itemId: number) => {
    setPacks([]);
    setPacksError('');
    setPackForm({ name: '', qty: '', ofPackId: '' });
    setPacksLoading(true);
    try {
      const res = await getPurchaseUnits(itemId);
      setPacks(res.purchase_units);
    } catch (e) { setPacksError((e as Error).message); }
    finally { setPacksLoading(false); }
  };

  const savePack = async () => {
    if (!editItem) return;
    const name = packForm.name.trim();
    const qty = parseFloat(packForm.qty);
    if (!name) { setPacksError('Give the pack a name, like Tray or Case.'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setPacksError('Say how much is in it.'); return; }
    setPackSaving(true);
    setPacksError('');
    try {
      await createPurchaseUnit(editItem.id, packForm.ofPackId
        // "A case is 7 trays" — how a box is actually described. The server
        // resolves it to the base unit before storing.
        ? { name, of_purchase_unit_id: Number(packForm.ofPackId), of_quantity: qty }
        : { name, base_units: qty });
      const res = await getPurchaseUnits(editItem.id);
      setPacks(res.purchase_units);
      setPackForm({ name: '', qty: '', ofPackId: '' });
      // The row shows an item's packs, so it has to hear about a new one.
      void loadItems();
    } catch (e) { setPacksError((e as Error).message); }
    finally { setPackSaving(false); }
  };

  const removePack = async (id: number) => {
    if (!editItem) return;
    setPackSaving(true);
    try {
      await deletePurchaseUnit(editItem.id, id);
      setPacks((p) => p.filter((x) => x.id !== id));
      void loadItems();
    } catch (e) { setPacksError((e as Error).message); }
    finally { setPackSaving(false); }
  };

  /*
   * Editing an item. Everything about a SKU was fixed at creation until now:
   * a typo in the name, or a unit set to kg when the thing is counted in
   * pieces, meant abandoning the item and making another one.
   *
   * Two fields are deliberately not here. Stock on hand changes through
   * Adjust Stock, so every movement leaves a trail; typing over it would let
   * stock change with no record of who or why. Unit cost is the weighted
   * average your purchases built, so it is theirs to set, not a free-text box.
   */
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', unit: '', sku: '', barcode: '', inventory_category_id: '', preferred_supplier_id: '',
    reorder_point: '', lead_days: '', cover_days: '', storage_location: '', notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setEditError('');
    void loadPacks(item.id);
    setEditForm({
      name: item.name ?? '',
      unit: item.unit ?? '',
      sku: item.sku ?? '',
      barcode: item.barcode ?? '',
      inventory_category_id: item.category?.id ? String(item.category.id) : '',
      preferred_supplier_id: item.preferred_supplier_id != null ? String(item.preferred_supplier_id) : '',
      reorder_point: item.reorder_level != null ? String(item.reorder_level) : '',
      lead_days: item.lead_days != null ? String(item.lead_days) : '',
      cover_days: item.cover_days != null ? String(item.cover_days) : '',
      storage_location: item.storage_location ?? '',
      notes: item.notes ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const name = editForm.name.trim();
    const unit = editForm.unit.trim();
    if (!name) { setEditError('Name is required.'); return; }
    if (!unit) { setEditError('Unit is required — what you count this in.'); return; }

    setEditSaving(true);
    setEditError('');
    try {
      const num = (v: string) => (v.trim() === '' ? null : Number(v));
      await updateInventoryItem(editItem.id, {
        name,
        unit,
        sku: editForm.sku.trim() || null,
        barcode: editForm.barcode.trim() || null,
        inventory_category_id: editForm.inventory_category_id ? Number(editForm.inventory_category_id) : null,
        preferred_supplier_id: editForm.preferred_supplier_id ? Number(editForm.preferred_supplier_id) : null,
        reorder_point: num(editForm.reorder_point),
        lead_days: num(editForm.lead_days),
        cover_days: num(editForm.cover_days),
        storage_location: editForm.storage_location.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setEditItem(null);
      void loadItems();
      void loadLowStock();
    } catch (e) { setEditError((e as Error).message); }
    finally { setEditSaving(false); }
  };


  /**
   * An item's packs, in one line for the row: "500 ml tin · 100 ml tin".
   *
   * Owner, 2026-09-06: "i dont see pack size". Whether an item had any was
   * invisible until you opened a modal, so a shop with packs set up looked
   * exactly like one without.
   */
  const packSummary = (item: InventoryItem): string | null => {
    const rows = item.purchase_units ?? [];
    if (rows.length === 0) return null;

    return rows
      .slice()
      .sort((a, b) => Number(a.base_units) - Number(b.base_units))
      .map((p) => `${p.name} (${Number(p.base_units)} ${item.unit})`)
      .join(' · ');
  };

  /**
   * The same stock figure counted in the biggest pack, when it divides
   * cleanly — "2500 ml" also being "5 × 500 ml tin" is what somebody
   * standing at the shelf is actually counting.
   *
   * Deliberately silent on a remainder: "4.6 tins" is not a thing anybody
   * has, and rounding it here would put a wrong number on the screen.
   */
  const packEquivalent = (item: InventoryItem): string | null => {
    const rows = (item.purchase_units ?? []).filter((p) => Number(p.base_units) > 1);
    if (rows.length === 0 || item.quantity_on_hand <= 0) return null;

    const biggest = rows.reduce((a, b) => (Number(a.base_units) >= Number(b.base_units) ? a : b));
    const whole = item.quantity_on_hand / Number(biggest.base_units);
    if (!Number.isInteger(whole) || whole < 1) return null;

    return `${whole} × ${biggest.name}`;
  };

  /**
   * The ± stepper, shown on both the desktop row and the mobile card.
   *
   * Bigger targets on a phone: 28px is fine for a mouse and awkward for a
   * thumb, so the same control is drawn at 40 there.
   */
  const stepper = (item: InventoryItem, isLow: boolean, big = false) => {
    const size = big ? 40 : 28;
    const btn = (dir: -1 | 1): React.CSSProperties => ({
      width: size, height: size, borderRadius: big ? 10 : 7,
      border: '1.5px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer',
      fontSize: big ? 20 : 16, fontWeight: 700, lineHeight: 1,
      color: dir === -1 ? 'var(--color-danger)' : 'var(--color-success)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    });
    const busy = quickAdjusting[item.id];
    return (
      <>
        <button
          onClick={() => quickAdjust(item, -1)}
          disabled={busy || item.quantity_on_hand <= 0}
          title="Remove 1"
          aria-label={`Remove one ${item.name}`}
          style={{ ...btn(-1), opacity: (busy || item.quantity_on_hand <= 0) ? 0.4 : 1 }}
        >−</button>
        <span style={{
          minWidth: big ? 56 : 32, textAlign: 'center', fontWeight: 700,
          fontSize: big ? 18 : 13, color: isLow ? 'var(--color-danger)' : 'var(--color-text)',
        }}>
          {busy ? '…' : item.quantity_on_hand}
        </span>
        <button
          onClick={() => quickAdjust(item, 1)}
          disabled={busy}
          title="Add 1"
          aria-label={`Add one ${item.name}`}
          style={{ ...btn(1), opacity: busy ? 0.4 : 1 }}
        >+</button>
      </>
    );
  };

  /** Everything you can do to an item, in one place for both layouts. */
  const itemActions = (item: InventoryItem) => (
    <>
      {canManage && (
        <Btn small variant="secondary" onClick={() => {
          setAdjustItem(item);
          setAdjForm({ type: 'add', quantity: '', reason: '' });
          setAdjError('');
        }} title="Full adjust dialog">⚙</Btn>
      )}
      {canManage && (
        <Btn
          small
          variant="secondary"
          disabled={togglingRequestable[item.id]}
          onClick={() => void toggleRequestable(item)}
          title={item.requestable
            ? 'On the staff request list — click to take it off'
            : 'Off the staff request list — click to put it back'}
          style={{ opacity: item.requestable ? 1 : 0.45 }}
        >
          🛒
        </Btn>
      )}
      {canManage && <Btn small variant="secondary" onClick={() => openEdit(item)} title="Edit this item">✏️</Btn>}
      <Btn small variant="secondary" onClick={() => void openLedger(item)} title="Stock movements">📜</Btn>
      <Btn small variant="secondary" onClick={() => void openPriceHistory(item)} title="Price history">📈</Btn>
    </>
  );

  const [ledgerItem, setLedgerItem] = useState<InventoryItem | null>(null);
  const [ledgerRows, setLedgerRows] = useState<StockMovementRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendingAdj = useRef<Record<number, number>>({});

  /**
   * Take an item on or off the list the floor can request from.
   *
   * Not everything in inventory belongs there — a sack bought by the pallet is
   * not something the counter orders. Optimistic, because it is a one-bit
   * change nobody waits for; on failure the row snaps back and says why.
   */
  const [togglingRequestable, setTogglingRequestable] = useState<Record<number, boolean>>({});

  const toggleRequestable = async (item: InventoryItem) => {
    const next = !item.requestable;
    setTogglingRequestable((s) => ({ ...s, [item.id]: true }));
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, requestable: next } : i)));
    try {
      await updateInventoryItem(item.id, { requestable: next });
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, requestable: item.requestable } : i)));
      setError((e as Error).message);
    } finally {
      setTogglingRequestable((s) => ({ ...s, [item.id]: false }));
    }
  };

  const quickAdjust = (item: InventoryItem, delta: number) => {
    pendingAdj.current[item.id] = (pendingAdj.current[item.id] ?? 0) + delta;
    setQuickAdjusting((s) => ({ ...s, [item.id]: true }));
    // Optimistically update local items list
    setItems((prev) => prev.map((i) => i.id === item.id
      ? { ...i, quantity_on_hand: Math.max(0, i.quantity_on_hand + delta) }
      : i
    ));
    clearTimeout(debounceTimers.current[item.id]);
    debounceTimers.current[item.id] = setTimeout(async () => {
      const total = pendingAdj.current[item.id] ?? 0;
      delete pendingAdj.current[item.id];
      if (total === 0) { setQuickAdjusting((s) => ({ ...s, [item.id]: false })); return; }
      try {
        // Backend expects a signed delta — total is already signed
        // (+ for the ± up button, − for the down button) so we pass
        // it straight through. Previously we sent {type:'add'|'remove',
        // quantity: |total|} which the validator rejected outright,
        // so every quick ± round-tripped a 422 and the stock never
        // actually moved server-side.
        await adjustInventoryStock(item.id, { delta: total, notes: 'Quick adjust' });
        void loadItems();
      } catch { void loadItems(); }
      finally { setQuickAdjusting((s) => ({ ...s, [item.id]: false })); }
    }, 800);
  };

  const loadItems = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchInventoryItems({ search: searchDebounced || undefined });
      setItems(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadLowStock = async () => {
    try {
      const res = await fetchLowStockItems();
      setLowCount((res.data ?? []).length);
    } catch {
      // Non-critical: badge simply won't show if this fails
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { void loadItems(); }, [searchDebounced]);
  useEffect(() => { void loadLowStock(); }, []);

  // ── Prepared stock tab ─────────────────────────────────────────────────────
  const [preparedRows, setPreparedRows] = useState<PreparedStockRow[]>([]);
  const [preparedLoading, setPreparedLoading] = useState(false);
  const [preparedError, setPreparedError] = useState('');
  const [prepAdjust, setPrepAdjust] = useState<PreparedStockRow | null>(null);
  const [prepDelta, setPrepDelta] = useState('');
  const [prepNotes, setPrepNotes] = useState('');
  const [prepSaving, setPrepSaving] = useState(false);
  const [prepAdjError, setPrepAdjError] = useState('');

  const loadPrepared = async () => {
    setPreparedLoading(true); setPreparedError('');
    try {
      const res = await fetchPreparedStock();
      setPreparedRows(res.items ?? []);
    } catch (e) { setPreparedError((e as Error).message); }
    finally { setPreparedLoading(false); }
  };

  useEffect(() => { if (tab === 'prepared') void loadPrepared(); }, [tab]);

  const handlePrepAdjust = async () => {
    if (!prepAdjust) return;
    const delta = parseInt(prepDelta, 10);
    if (isNaN(delta) || delta === 0) { setPrepAdjError('Enter a non-zero whole number.'); return; }
    setPrepSaving(true); setPrepAdjError('');
    try {
      await adjustPreparedStock(prepAdjust.item_id, {
        delta,
        variant_id: prepAdjust.variant_id,
        notes: prepNotes || undefined,
      });
      setPrepAdjust(null);
      setPrepDelta('');
      setPrepNotes('');
      void loadPrepared();
    } catch (e) { setPrepAdjError((e as Error).message); }
    finally { setPrepSaving(false); }
  };

  const handleAdjust = async () => {
    const qty = parseFloat(adjForm.quantity);
    if (isNaN(qty) || qty < 0) { setAdjError('Enter a valid quantity.'); return; }
    setAdjSaving(true); setAdjError('');
    try {
      // Translate the UI's add/remove/set semantics into a signed
      // delta the backend understands. For 'set' we need the current
      // on-hand to compute the move; we have it from the row that
      // opened this modal.
      let delta: number;
      if (adjForm.type === 'add') {
        delta = qty;
      } else if (adjForm.type === 'remove') {
        delta = -qty;
      } else {
        delta = qty - (adjustItem!.quantity_on_hand ?? 0);
      }
      await adjustInventoryStock(adjustItem!.id, {
        delta,
        notes: adjForm.reason || undefined,
      });
      setAdjustItem(null);
      setAdjForm({ type: 'add', quantity: '', reason: '' });
      void loadItems();
    } catch (e) { setAdjError((e as Error).message); }
    finally { setAdjSaving(false); }
  };

  // ── Categories tab ─────────────────────────────────────────────────────────
  const [cats, setCats] = useState<InventoryCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [editCat, setEditCat] = useState<InventoryCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();

  const loadCats = async () => {
    setCatsLoading(true);
    try { const r = await fetchInventoryCategories(); setCats(r.categories ?? []); }
    catch (e) { setCatError((e as Error).message); }
    finally { setCatsLoading(false); }
  };

  const loadSuppliers = async () => {
    try {
      const r = await fetchSuppliers({ active_only: true });
      setSuppliers(r.data ?? []);
    } catch {
      // Non-critical for create form
    }
  };

  useEffect(() => { if (tab === 'categories') void loadCats(); }, [tab]);

  // ── Unit Conversions tab ───────────────────────────────────────────────────
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState('');
  const [convForm, setConvForm] = useState({ from_unit: '', to_unit: '', factor: '' });
  const [convSaving, setConvSaving] = useState(false);

  const loadConversions = async () => {
    setConvLoading(true);
    try { const r = await getUnitConversions(); setConversions(r.conversions ?? []); }
    catch (e) { setConvError((e as Error).message); }
    finally { setConvLoading(false); }
  };

  useEffect(() => { if (tab === 'conversions') void loadConversions(); }, [tab]);

  const handleAddConversion = async () => {
    const f = parseFloat(convForm.factor);
    if (!convForm.from_unit.trim() || !convForm.to_unit.trim() || isNaN(f) || f <= 0) {
      setConvError('All fields are required and factor must be > 0.'); return;
    }
    setConvSaving(true); setConvError('');
    try {
      await createUnitConversion({ from_unit: convForm.from_unit.trim(), to_unit: convForm.to_unit.trim(), factor: f });
      setConvForm({ from_unit: '', to_unit: '', factor: '' });
      void loadConversions();
    } catch (e) { setConvError((e as Error).message); }
    finally { setConvSaving(false); }
  };

  const handleDeleteConversion = (id: number) => {
    askConfirm({
      title: 'Delete Conversion',
      message: 'Delete this unit conversion? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try { await deleteUnitConversion(id); void loadConversions(); }
        catch (e) { setConvError((e as Error).message); }
      },
    });
  };

  // ── Price History drawer ───────────────────────────────────────────────────
  const [priceHistoryItem, setPriceHistoryItem] = useState<InventoryItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<InventoryPriceHistoryEntry[]>([]);
  const [cheapestSupplier, setCheapestSupplier] = useState<CheapestSupplier | null | undefined>(undefined);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const openLedger = async (item: InventoryItem) => {
    setLedgerItem(item);
    setLedgerLoading(true);
    setLedgerError('');
    setLedgerRows([]);
    try {
      const res = await fetchInventoryItemDetail(item.id, { per_page: 50 });
      setLedgerRows(res.movements.data ?? []);
    } catch (e) {
      setLedgerError((e as Error).message || 'Could not load movements');
    } finally {
      setLedgerLoading(false);
    }
  };

  const openPriceHistory = async (item: InventoryItem) => {
    setPriceHistoryItem(item);
    setPriceHistory([]);
    setCheapestSupplier(undefined);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const [histRes, cheapRes] = await Promise.all([
        getInventoryPriceHistory(item.id),
        getInventoryCheapestSupplier(item.id),
      ]);
      setPriceHistory(histRes.history);
      setCheapestSupplier(cheapRes.supplier);
    } catch (e) { setHistoryError((e as Error).message); }
    finally { setHistoryLoading(false); }
  };

  // ── Stock Count tab ────────────────────────────────────────────────────────
  const [countItems, setCountItems] = useState<InventoryItem[]>([]);
  const [countQtys, setCountQtys] = useState<Record<number, string>>({});
  const [countNotes, setCountNotes] = useState<Record<number, string>>({});
  const [countLoading, setCountLoading] = useState(false);
  const [countSaving, setCountSaving] = useState(false);
  const [countResult, setCountResult] = useState<{ item_id: number; difference: number; balance_after: number }[] | null>(null);
  const [countError, setCountError] = useState('');

  const loadCountItems = async () => {
    setCountLoading(true);
    try {
      // Paginate through all inventory items (API doesn't support per_page override)
      const allItems: InventoryItem[] = [];
      let page = 1;
      while (true) {
        const r = await fetchInventoryItems({ page });
        allItems.push(...(r.data ?? []));
        if ((r.meta?.current_page ?? 1) >= (r.meta?.last_page ?? 1)) break;
        page++;
      }
      setCountItems(allItems);
      const qtys: Record<number, string> = {};
      allItems.forEach((i) => { qtys[i.id] = String(i.quantity_on_hand ?? ''); });
      setCountQtys(qtys);
    } catch (e) { setCountError((e as Error).message); }
    finally { setCountLoading(false); }
  };

  useEffect(() => { if (tab === 'stock-count') void loadCountItems(); }, [tab]);

  const handleSubmitCount = async () => {
    const counts = countItems
      .filter((i) => countQtys[i.id] !== '' && countQtys[i.id] !== undefined)
      .map((i) => ({ inventory_item_id: i.id, quantity: parseFloat(countQtys[i.id] ?? '0'), notes: countNotes[i.id] }));
    if (counts.some((c) => isNaN(c.quantity) || c.quantity < 0)) { setCountError('One or more quantities are invalid.'); return; }
    if (!counts.length) { setCountError('No counts entered.'); return; }
    setCountSaving(true); setCountError('');
    try {
      const res = await submitStockCount(counts);
      setCountResult(res.adjustments);
    } catch (e) { setCountError((e as Error).message); }
    finally { setCountSaving(false); }
  };

  const openCatModal = (cat?: InventoryCategory) => {
    setEditCat(cat ?? null);
    setCatName(cat?.name ?? '');
    setCatError('');
    setCatModal(true);
  };

  const handleSaveCat = async () => {
    if (!catName.trim()) { setCatError('Name is required.'); return; }
    setCatSaving(true); setCatError('');
    try {
      if (editCat) {
        await updateInventoryCategory(editCat.id, { name: catName.trim() });
      } else {
        await createInventoryCategory({ name: catName.trim() });
      }
      setCatModal(false);
      void loadCats();
    } catch (e) { setCatError((e as Error).message); }
    finally { setCatSaving(false); }
  };

  return (
    <PageShell>
    <div>
      <ConfirmDialog state={dlg} close={closeDlg} />
      <PageHeader section="Manage"
        title="Inventory"
        subtitle={lowCount > 0 ? `${lowCount} item${lowCount !== 1 ? 's' : ''} below reorder level` : undefined}
        action={tab === 'stock' && items.length > 0 ? (
          <Btn small variant="secondary" onClick={() => downloadCSV('inventory-stock', items.map((i) => ({
            Name: i.name, SKU: i.sku ?? '', Category: i.category?.name ?? '', Unit: i.unit,
            'Qty on Hand': i.quantity_on_hand, 'Reorder Level': i.reorder_level ?? '',
            Status: i.quantity_on_hand <= (i.reorder_level ?? 0) ? 'Low Stock' : 'OK',
          })))}>Export CSV</Btn>
        ) : undefined}
      />

      <TableStateBar error={error} onRetry={() => void loadItems()} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        <button style={S.tab(tab === 'stock')} onClick={() => setTab('stock')}>Stock</button>
        {canPrepared && (
          <button style={S.tab(tab === 'prepared')} onClick={() => setTab('prepared')}>Prepared Stock</button>
        )}
        {canCategories && (
          <button style={S.tab(tab === 'categories')} onClick={() => setTab('categories')}>Categories</button>
        )}
        {canManage && (
          <>
            <button style={S.tab(tab === 'conversions')} onClick={() => setTab('conversions')}>Unit Conversions</button>
            <button style={S.tab(tab === 'stock-count')} onClick={() => setTab('stock-count')}>Stock Count</button>
            <button style={S.tab(tab === 'waste')} onClick={() => setTab('waste')}>Waste</button>
          </>
        )}
      </div>

      {/* ── Stock Tab ── */}
      {tab === 'stock' && (
        <>
          {lowCount > 0 && (
            <div style={{ background: '#FEF3E8', border: '1px solid var(--color-primary)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--color-primary)', fontWeight: 600 }}>
              ⚠ {lowCount} item{lowCount !== 1 ? 's are' : ' is'} below reorder level
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total Items" value={String(items.length)} accent="var(--color-primary)" />
            <StatCard label="Low Stock" value={String(lowCount)} accent={lowCount > 0 ? 'var(--color-danger)' : 'var(--color-success-strong)'} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...S.input, maxWidth: 320 }}
            />
            {canManage && (
              <Btn onClick={() => {
                setCreateOpen(true);
                setCreateError('');
                setCreateForm({
                  name: '', sku: '', barcode: '', unit: 'kg', current_stock: '', reorder_point: '', lead_days: '', cover_days: '', unit_cost: '',
                  inventory_category_id: '', preferred_supplier_id: '', storage_location: '', notes: '',
                });
                if (cats.length === 0) void loadCats();
                if (suppliers.length === 0) void loadSuppliers();
              }}>
                + Add SKU
              </Btn>
            )}
            {items.length > 0 && (
              <Btn
                small
                variant="secondary"
                title="Print a sheet of barcodes for the items listed — supplier barcode where known, otherwise the SKU — so receiving can scan them"
                onClick={() => {
                  const plan = planShelfLabels(items);
                  if (plan.labels.length === 0) {
                    setError('None of the listed items has a barcode or SKU to print.');
                    return;
                  }
                  const win = window.open('', '_blank', 'noopener,width=900,height=700');
                  if (!win) {
                    setError('The browser blocked the label window — allow pop-ups for this site and try again.');
                    return;
                  }
                  win.document.open();
                  win.document.write(shelfLabelsHtml(plan, `Shelf labels — ${items.length} item${items.length === 1 ? '' : 's'}`));
                  win.document.close();
                }}
              >
                🏷 Print labels ({items.length})
              </Btn>
            )}
          </div>

          {/* On a phone the seven-column table forces a sideways scroll and
              the action cell squeezes six buttons into a thumb's width, so the
              same rows are drawn as cards. Both layouts share `stepper` and
              `itemActions`, so what you can do never depends on the screen. */}
          {isMobile ? (
            loading ? (
              <TableSkeleton rows={5} cols={2} />
            ) : items.length === 0 ? (
              <EmptyState message="No inventory items found." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {items.map((item) => {
                  const isLow = item.reorder_level != null && item.quantity_on_hand <= item.reorder_level;
                  return (
                    <article
                      key={item.id}
                      data-testid={`inventory-card-${item.id}`}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderLeft: `4px solid ${isLow ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        borderRadius: 12, padding: '12px 14px', background: 'var(--color-surface)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {[item.sku, item.category?.name].filter(Boolean).join(' · ') || 'No SKU'}
                          </div>
                          {packSummary(item) && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                              Buys as {packSummary(item)}
                            </div>
                          )}
                        </div>
                        {isLow && <Badge color="red">Low</Badge>}
                      </div>

                      {/* The number people came to see, at a size they can read. */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
                        flexWrap: 'wrap',
                      }}>
                        {canManage ? stepper(item, isLow, true) : (
                          <span style={{ fontSize: 18, fontWeight: 700, color: isLow ? 'var(--color-danger)' : 'var(--color-text)' }}>
                            {item.quantity_on_hand}
                          </span>
                        )}
                        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                          {item.unit}
                          {packEquivalent(item) && (
                            <span style={{ color: 'var(--color-text-muted)' }}> · {packEquivalent(item)}</span>
                          )}
                          {item.reorder_level != null && (
                            <span style={{ color: 'var(--color-text-muted)' }}> · reorder at {item.reorder_level}</span>
                          )}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                        {itemActions(item)}
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : (
          <TableCard stickyHead>
            {loading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : items.length === 0 ? (
              <EmptyState message="No inventory items found." />
            ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'SKU', 'Category', 'On Hand', 'Reorder Level', 'Status', 'Actions'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const isLow = item.reorder_level != null && item.quantity_on_hand <= item.reorder_level;
                  return (
                    <tr key={item.id}>
                      <td style={{ ...TD, fontWeight: 600 }}>
                        {item.name}
                        {packSummary(item) && (
                          <div style={{ fontWeight: 400, fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            Buys as {packSummary(item)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{item.sku ?? '—'}</td>
                      <td style={TD}>{item.category?.name ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                      <td style={{ ...TD, fontWeight: 700 }}>
                        {item.quantity_on_hand} {item.unit}
                        {packEquivalent(item) && (
                          <div style={{ fontWeight: 400, fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {packEquivalent(item)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, color: 'var(--color-text-muted)' }}>
                        {item.reorder_level != null ? `${item.reorder_level} ${item.unit}` : '—'}
                      </td>
                      <td style={TD}>
                        <Badge color={isLow ? 'red' : 'green'}>{isLow ? 'Low Stock' : 'OK'}</Badge>
                      </td>
                      <td style={TD}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {canManage ? stepper(item, isLow) : (
                            <span style={{ fontSize: 13, fontWeight: 700, color: isLow ? 'var(--color-danger)' : 'var(--color-text)' }}>{item.quantity_on_hand}</span>
                          )}
                          {itemActions(item)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </TableCard>
          )}
        </>
      )}

      {/* ── Prepared Stock Tab ── */}
      {tab === 'prepared' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14, lineHeight: 1.5, maxWidth: 720 }}>
            Prepared / bake-ahead stock tracks finished menu units separately from raw SKUs.
            Sales deduct prepared qty when stock tracking is on; recipe ingredients still deduct from raw inventory via recipes.
            COGS uses recipe cost at sale time — baking ahead does not double-count ingredient cost when both paths are configured correctly.
          </p>
          {preparedError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 12 }}>{preparedError}</p>}
          <TableCard stickyHead>
            {preparedLoading ? (
              <TableSkeleton rows={6} cols={4} />
            ) : preparedRows.length === 0 ? (
              <EmptyState message="No menu items track prepared stock. Enable stock tracking on menu items in Menu." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Item', 'On Hand', 'Low Threshold', 'Actions'].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preparedRows.map((row) => {
                    const isLow = row.stock <= row.low_stock_threshold;
                    return (
                      <tr key={`${row.item_id}-${row.variant_id ?? 'base'}`}>
                        <td style={{ ...TD, fontWeight: 600 }}>{row.name}</td>
                        <td style={{ ...TD, color: isLow ? 'var(--color-danger)' : 'var(--color-text)', fontWeight: 700 }}>{row.stock}</td>
                        <td style={{ ...TD, color: 'var(--color-text-muted)' }}>{row.low_stock_threshold}</td>
                        <td style={TD}>
                          {canPrepared ? (
                            <Btn small onClick={() => { setPrepAdjust(row); setPrepDelta(''); setPrepNotes(''); setPrepAdjError(''); }}>
                              Adjust
                            </Btn>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TableCard>
        </>
      )}

      {/* ── Categories Tab ── */}
      {tab === 'categories' && (
        <>
          {canManage && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Btn onClick={() => openCatModal()}>+ Add Category</Btn>
          </div>
          )}
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Actions'].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {catsLoading ? (
                  <tr><td colSpan={2} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Loading…</td></tr>
                ) : cats.length === 0 ? (
                  <tr><td colSpan={2}><EmptyState message="No categories yet." /></td></tr>
                ) : cats.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ ...TD, fontWeight: 600 }}>{cat.name}</td>
                    <td style={TD}>
                      <Btn small variant="secondary" onClick={() => openCatModal(cat)}>Edit</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ── Adjust Modal ── */}
      {adjustItem && (
        <Modal title={`Adjust Stock — ${adjustItem.name}`} onClose={() => setAdjustItem(null)} maxWidth={400}>
          {adjError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{adjError}</p>}
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Current stock: <strong>{adjustItem.quantity_on_hand} {adjustItem.unit}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={S.label}>Adjustment Type</span>
              <select value={adjForm.type} onChange={e => setAdjForm(f => ({ ...f, type: e.target.value as 'add' | 'remove' | 'set' }))} style={S.select}>
                <option value="add">Add (increase)</option>
                <option value="remove">Remove (decrease)</option>
                <option value="set">Set to exact amount</option>
              </select>
            </label>
            <label>
              <span style={S.label}>Quantity *</span>
              <input type="number" min="0" step="any" placeholder={adjForm.type === 'set' ? 'New total' : 'Amount'} value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Reason</span>
              <input type="text" placeholder="e.g. Stock count, received delivery…" value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))} style={S.input} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setAdjustItem(null)}>Cancel</Btn>
            <Btn onClick={handleAdjust} disabled={adjSaving}>{adjSaving ? 'Saving…' : 'Save Adjustment'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Edit an item ── */}
      {editItem && (
        <Modal title={`Edit — ${editItem.name}`} onClose={() => setEditItem(null)} maxWidth={520}>
          {editError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 10 }}>{editError}</p>}
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              <span style={S.label}>Name *</span>
              <input style={S.input} value={editForm.name} aria-label="Item name"
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Unit *</span>
              <input style={S.input} value={editForm.unit} aria-label="Item unit" placeholder="kg, L, piece…"
                onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} />
              {/* Changing the unit does not convert the number already on the
                  shelf, so 5 kg becomes 5 piece and the count is now a lie.
                  Said plainly rather than blocked: sometimes it is the fix. */}
              {editForm.unit.trim().toLowerCase() !== (editItem.unit ?? '').trim().toLowerCase()
                && editItem.quantity_on_hand > 0 && (
                <p style={{ fontSize: 12, color: 'var(--color-warning)', margin: '6px 0 0', lineHeight: 1.45 }}>
                  This item has {editItem.quantity_on_hand} {editItem.unit} on hand. Changing the unit
                  re-labels that number, it does not convert it — you will want a stock count after.
                </p>
              )}
            </label>

            {/* ── Pack sizes: how you buy it ─────────────────────────────
                Sits under Unit because that is the number it is measured
                against: ghee counted in ml, bought as a 100 ml or 500 ml tin.
                Saves on its own, so the note says so — Cancel above closes
                the form, it does not take a pack back. */}
            <div
              data-testid="pack-sizes-section"
              style={{
                border: '1px solid var(--color-border)', borderRadius: 10,
                padding: '12px 14px', background: 'var(--color-bg)',
              }}
            >
              <p style={{ ...S.label, margin: '0 0 4px' }}>Pack sizes — how you buy this</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Stock is counted in <strong style={{ color: 'var(--color-text)' }}>{editItem.unit}</strong>.
                Add the containers you actually buy — a 500 ml tin, a case — and a purchase order can say
                “2 tins” while the shelf gains the right number and the price per {editItem.unit} works
                itself out. These save as you add them.
              </p>
              {packsError && (
                <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 10 }}>{packsError}</p>
              )}

              {packsLoading ? <TableSkeleton rows={2} cols={2} /> : packs.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                  No packs yet — this is bought loose, by the {editItem.unit}.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                  {packs.map((p) => (
                    <div key={p.id} data-testid={`pack-row-${p.id}`} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      border: '1px solid var(--color-border)', borderRadius: 10,
                      padding: '8px 12px', background: 'var(--color-surface)',
                    }}>
                      <span style={{ fontSize: 13 }}>
                        <strong>{p.name}</strong>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          {' '}= {Number(p.base_units)} {editItem.unit}
                        </span>
                      </span>
                      <Btn small variant="ghost" disabled={packSaving} onClick={() => void removePack(p.id)}>Remove</Btn>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 8px' }}>Add a pack</p>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  aria-label="Pack name"
                  placeholder="Name, e.g. 500 ml tin or Case"
                  value={packForm.name}
                  onChange={(e) => setPackForm((f) => ({ ...f, name: e.target.value }))}
                  style={S.input}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>1 of these is</span>
                  <input
                    aria-label="Amount in the pack"
                    type="number"
                    min="0.000001"
                    step="any"
                    placeholder="500"
                    value={packForm.qty}
                    onChange={(e) => setPackForm((f) => ({ ...f, qty: e.target.value }))}
                    style={{ ...S.input, width: 100 }}
                  />
                  {/* A case is 7 trays. Defining a big pack from a small one is
                      how people describe a box, and beats multiplying it out. */}
                  <select
                    aria-label="Measured in"
                    value={packForm.ofPackId}
                    onChange={(e) => setPackForm((f) => ({ ...f, ofPackId: e.target.value }))}
                    style={{ ...S.select, width: 'auto', minWidth: 130 }}
                  >
                    <option value="">{editItem.unit}</option>
                    {packs.map((p) => <option key={p.id} value={p.id}>{p.name.toLowerCase()}</option>)}
                  </select>
                  <Btn small onClick={() => void savePack()} disabled={packSaving}>
                    {packSaving ? 'Saving…' : 'Add pack'}
                  </Btn>
                </div>
              </div>
            </div>
            <label>
              <span style={S.label}>SKU</span>
              <input style={S.input} value={editForm.sku} aria-label="SKU"
                onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Barcode</span>
              <input style={S.input} value={editForm.barcode} aria-label="Barcode" inputMode="numeric" autoComplete="off"
                onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Category</span>
              <select style={S.select} value={editForm.inventory_category_id} aria-label="Category"
                onChange={(e) => setEditForm((f) => ({ ...f, inventory_category_id: e.target.value }))}>
                <option value="">No category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <span style={S.label}>Preferred supplier</span>
              <select style={S.select} value={editForm.preferred_supplier_id} aria-label="Preferred supplier"
                onChange={(e) => setEditForm((f) => ({ ...f, preferred_supplier_id: e.target.value }))}>
                <option value="">None</option>
                {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
              </select>
            </label>
            <label>
              <span style={S.label}>Reorder point</span>
              <input type="number" min="0" step="any" style={S.input} value={editForm.reorder_point} aria-label="Reorder point"
                onChange={(e) => setEditForm((f) => ({ ...f, reorder_point: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Supplier lead days</span>
              <input type="number" min="0" max="30" step="1" style={S.input} value={editForm.lead_days} aria-label="Lead days"
                onChange={(e) => setEditForm((f) => ({ ...f, lead_days: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Cover days (order horizon)</span>
              <input type="number" min="1" max="90" step="1" style={S.input} value={editForm.cover_days} aria-label="Cover days"
                onChange={(e) => setEditForm((f) => ({ ...f, cover_days: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Storage location</span>
              <input style={S.input} value={editForm.storage_location} aria-label="Storage location"
                onChange={(e) => setEditForm((f) => ({ ...f, storage_location: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Notes</span>
              <input style={S.input} value={editForm.notes} aria-label="Notes"
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '12px 0 0', lineHeight: 1.45 }}>
            Stock on hand is changed through Adjust Stock, so every movement is recorded.
            Unit cost is the average your purchases have paid.
          </p>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setEditItem(null)}>Cancel</Btn>
            <Btn disabled={editSaving} onClick={() => void saveEdit()}>{editSaving ? 'Saving…' : 'Save changes'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Stock movements ledger ── */}
      {ledgerItem && (
        <Modal title={`Movements — ${ledgerItem.name}`} onClose={() => setLedgerItem(null)} maxWidth={640}>
          {ledgerError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{ledgerError}</p>}
          {ledgerLoading ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
          ) : ledgerRows.length === 0 ? (
            <EmptyState message="No stock movements yet for this item." />
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['When', 'Type', 'Qty', 'Balance', 'By', 'Notes'].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((m) => (
                    <tr key={m.id}>
                      <td style={{ ...TD, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {m.created_at ? new Date(m.created_at).toLocaleString() : '—'}
                      </td>
                      <td style={{ ...TD, textTransform: 'capitalize' }}>{m.type?.replace(/_/g, ' ')}</td>
                      <td style={{ ...TD, fontWeight: 700, color: Number(m.quantity) < 0 ? 'var(--color-danger)' : 'var(--color-success-strong)' }}>
                        {Number(m.quantity) > 0 ? '+' : ''}{Number(m.quantity)}
                      </td>
                      <td style={TD}>{m.balance_after ?? '—'}</td>
                      <td style={{ ...TD, fontSize: 12 }}>{m.user?.name ?? '—'}</td>
                      <td style={{ ...TD, fontSize: 12, color: 'var(--color-text-secondary)' }}>{m.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
          <ModalActions>
            <Btn variant="secondary" onClick={() => setLedgerItem(null)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Create SKU Modal ── */}
      {createOpen && (
        <Modal title="Add Inventory SKU" onClose={() => setCreateOpen(false)} maxWidth={480}>
          {createError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{createError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={S.label}>Name *</span>
              <input style={S.input} value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>SKU</span>
              <input style={S.input} value={createForm.sku} onChange={(e) => setCreateForm((f) => ({ ...f, sku: e.target.value }))} />
            </label>
            {/* The supplier's barcode, so a delivery is received by scanning
                the packet. Type it, scan it with a gun into the box, or use
                the camera. Owner, 2026-09-02. */}
            <label>
              <span style={S.label}>Barcode</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={createForm.barcode}
                  onChange={(e) => setCreateForm((f) => ({ ...f, barcode: e.target.value }))}
                  placeholder="Scan or type the packet barcode"
                  inputMode="numeric"
                  autoComplete="off"
                  data-testid="inventory-barcode"
                />
                <Btn variant="secondary" onClick={() => setScanBarcode(true)} aria-label="Scan barcode with the camera" title="Scan with the camera">📷</Btn>
              </div>
            </label>
            {scanBarcode && (
              <ScanSheet
                title="Scan the packet"
                onScan={(code) => { setCreateForm((f) => ({ ...f, barcode: code.trim() })); setScanBarcode(false); }}
                onClose={() => setScanBarcode(false)}
              />
            )}
            <label>
              <span style={S.label}>Category</span>
              <select
                style={S.select}
                value={createForm.inventory_category_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, inventory_category_id: e.target.value }))}
              >
                <option value="">No category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <span style={S.label}>Preferred supplier</span>
              <select
                style={S.select}
                value={createForm.preferred_supplier_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, preferred_supplier_id: e.target.value }))}
              >
                <option value="">None</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              <span style={S.label}>Unit *</span>
              <input style={S.input} value={createForm.unit} onChange={(e) => setCreateForm((f) => ({ ...f, unit: e.target.value }))} placeholder="kg, L, pcs…" />
            </label>
            <label>
              <span style={S.label}>Opening stock</span>
              <input type="number" min="0" step="any" style={S.input} value={createForm.current_stock} onChange={(e) => setCreateForm((f) => ({ ...f, current_stock: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Reorder point</span>
              <input type="number" min="0" step="any" style={S.input} value={createForm.reorder_point} onChange={(e) => setCreateForm((f) => ({ ...f, reorder_point: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Supplier lead days</span>
              <input
                type="number"
                min="0"
                max="30"
                step="1"
                style={S.input}
                value={createForm.lead_days}
                onChange={(e) => setCreateForm((f) => ({ ...f, lead_days: e.target.value }))}
                placeholder="Default 3 on Restock Plan"
              />
            </label>
            <label>
              <span style={S.label}>Cover days (order horizon)</span>
              <input
                type="number"
                min="1"
                max="90"
                step="1"
                style={S.input}
                value={createForm.cover_days}
                onChange={(e) => setCreateForm((f) => ({ ...f, cover_days: e.target.value }))}
                placeholder="Default 14 on Restock Plan"
              />
            </label>
            <label>
              <span style={S.label}>Unit cost (MVR)</span>
              <input type="number" min="0" step="any" style={S.input} value={createForm.unit_cost} onChange={(e) => setCreateForm((f) => ({ ...f, unit_cost: e.target.value }))} />
            </label>
            <label>
              <span style={S.label}>Storage location</span>
              <input style={S.input} value={createForm.storage_location} onChange={(e) => setCreateForm((f) => ({ ...f, storage_location: e.target.value }))} placeholder="e.g. Cold room, Dry store" />
            </label>
            <label>
              <span style={S.label}>Notes</span>
              <input style={S.input} value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn disabled={createSaving} onClick={() => {
              if (!createForm.name.trim() || !createForm.unit.trim()) { setCreateError('Name and unit are required.'); return; }
              setCreateSaving(true);
              void createInventoryItem({
                name: createForm.name.trim(),
                sku: createForm.sku.trim() || undefined,
                barcode: createForm.barcode.trim() || undefined,
                unit: createForm.unit.trim(),
                current_stock: createForm.current_stock ? parseFloat(createForm.current_stock) : undefined,
                reorder_point: createForm.reorder_point ? parseFloat(createForm.reorder_point) : undefined,
                lead_days: (() => {
                  if (createForm.lead_days === '') return undefined;
                  const n = parseInt(createForm.lead_days, 10);
                  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) : undefined;
                })(),
                cover_days: (() => {
                  if (createForm.cover_days === '') return undefined;
                  const n = parseInt(createForm.cover_days, 10);
                  return Number.isFinite(n) ? Math.min(90, Math.max(1, n)) : undefined;
                })(),
                unit_cost: createForm.unit_cost ? parseFloat(createForm.unit_cost) : undefined,
                inventory_category_id: createForm.inventory_category_id ? Number(createForm.inventory_category_id) : undefined,
                preferred_supplier_id: createForm.preferred_supplier_id ? Number(createForm.preferred_supplier_id) : undefined,
                storage_location: createForm.storage_location.trim() || undefined,
                notes: createForm.notes.trim() || undefined,
              }).then(() => {
                setCreateOpen(false);
                void loadItems();
              }).catch((e: Error) => setCreateError(e.message)).finally(() => setCreateSaving(false));
            }}>{createSaving ? 'Saving…' : 'Create'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Category Modal ── */}
      {catModal && (
        <Modal title={editCat ? 'Edit Category' : 'Add Category'} onClose={() => setCatModal(false)} maxWidth={360}>
          {catError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{catError}</p>}
          <label>
            <span style={S.label}>Category Name *</span>
            <input type="text" placeholder="e.g. Produce, Dairy…" value={catName} onChange={e => setCatName(e.target.value)} style={S.input} />
          </label>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setCatModal(false)}>Cancel</Btn>
            <Btn onClick={handleSaveCat} disabled={catSaving}>{catSaving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Unit Conversions Tab ── */}
      {tab === 'conversions' && (
        <div>
          {convError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{convError}</p>}
          <div data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end', marginBottom: 20, background: '#F9F5F0', padding: 16, borderRadius: 12 }}>
            {(['from_unit', 'to_unit', 'factor'] as const).map((k) => (
              <div key={k}>
                <label style={S.label}>{k === 'from_unit' ? 'From Unit' : k === 'to_unit' ? 'To Unit' : 'Factor'}</label>
                <input value={convForm[k]} onChange={(e) => setConvForm((f) => ({ ...f, [k]: e.target.value }))}
                  type={k === 'factor' ? 'number' : 'text'} min="0.000001" step="0.001"
                  placeholder={k === 'factor' ? '1.0' : k === 'from_unit' ? 'kg' : 'g'}
                  style={S.input} />
              </div>
            ))}
            <Btn onClick={() => void handleAddConversion()} disabled={convSaving}>{convSaving ? '…' : '+ Add'}</Btn>
          </div>
          {convLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p> : conversions.length === 0 ? (
            <EmptyState message="No conversions defined." />
          ) : (
            <TableCard>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={TH}>From</th><th style={TH}>To</th><th style={TH}>Factor</th><th style={TH}></th>
                </tr></thead>
                <tbody>
                  {conversions.map((c) => (
                    <tr key={c.id}>
                      <td style={TD}>{c.from_unit}</td>
                      <td style={TD}>{c.to_unit}</td>
                      <td style={TD}>{c.factor}</td>
                      <td style={TD}><Btn small variant="danger" onClick={() => void handleDeleteConversion(c.id)}>Delete</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}
        </div>
      )}

      {/* ── Stock Count Tab ── */}
      {tab === 'stock-count' && (
        <div>
          {countError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{countError}</p>}
          {countResult ? (
            <div>
              <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
                ✓ Stock count submitted. {countResult.filter(r => r.difference !== 0).length} adjustments made.
              </div>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={TH}>Item</th><th style={TH}>Variance</th><th style={TH}>New Balance</th></tr></thead>
                  <tbody>
                    {countResult.map((r) => (
                      <tr key={r.item_id}>
                        <td style={TD}>{countItems.find(i => i.id === r.item_id)?.name ?? `#${r.item_id}`}</td>
                        <td style={{ ...TD, color: r.difference > 0 ? 'var(--color-success-strong)' : r.difference < 0 ? 'var(--color-danger-strong)' : 'var(--color-text-muted)', fontWeight: 700 }}>
                          {r.difference > 0 ? '+' : ''}{r.difference}
                        </td>
                        <td style={TD}>{r.balance_after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
              <Btn variant="secondary" onClick={() => { setCountResult(null); void loadCountItems(); }} style={{ marginTop: 16 }}>New Count</Btn>
            </div>
          ) : countLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading items…</p> : (
            <div>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                Enter the actual counted quantities. Leave blank to skip an item.
              </p>
              <TableCard>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={TH}>Item</th><th style={TH}>Unit</th>
                    <th style={TH}>On Hand</th><th style={TH}>Counted Qty</th><th style={TH}>Notes</th>
                  </tr></thead>
                  <tbody>
                    {countItems.map((item) => (
                      <tr key={item.id}>
                        <td style={{ ...TD, fontWeight: 600 }}>{item.name}</td>
                        <td style={TD}>{item.unit}</td>
                        <td style={{ ...TD, color: 'var(--color-text-muted)' }}>{item.quantity_on_hand ?? '—'}</td>
                        <td style={TD}>
                          <input type="number" min="0" step="0.001"
                            value={countQtys[item.id] ?? ''}
                            onChange={(e) => setCountQtys((q) => ({ ...q, [item.id]: e.target.value }))}
                            style={{ width: 90, padding: '5px 8px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
                        </td>
                        <td style={TD}>
                          <input value={countNotes[item.id] ?? ''}
                            onChange={(e) => setCountNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                            placeholder="Optional note"
                            style={{ width: 160, padding: '5px 8px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={() => void handleSubmitCount()} disabled={countSaving}>
                  {countSaving ? 'Submitting…' : '✓ Submit Stock Count'}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Prepared stock adjust modal ── */}
      {prepAdjust && (
        <Modal title={`Adjust Prepared Stock — ${prepAdjust.name}`} onClose={() => setPrepAdjust(null)}>
          {prepAdjError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 8 }}>{prepAdjError}</p>}
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            Current on hand: <strong>{prepAdjust.stock}</strong>. Use positive to add, negative to remove.
          </p>
          <label style={S.label}>Delta (+/−)</label>
          <input type="number" value={prepDelta} onChange={(e) => setPrepDelta(e.target.value)} style={{ ...S.input, marginBottom: 12 }} />
          <label style={S.label}>Notes (optional)</label>
          <input value={prepNotes} onChange={(e) => setPrepNotes(e.target.value)} style={{ ...S.input, marginBottom: 16 }} />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setPrepAdjust(null)}>Cancel</Btn>
            <Btn onClick={() => void handlePrepAdjust()} disabled={prepSaving}>{prepSaving ? 'Saving…' : 'Apply'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Price History Modal ── */}
      {priceHistoryItem && (
        <Modal title={`Price History — ${priceHistoryItem.name}`} onClose={() => setPriceHistoryItem(null)} maxWidth={560}>
          {historyError && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 8 }}>{historyError}</p>}
          {historyLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Loading…</p> : (
            <>
              {cheapestSupplier && (
                <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
                  💰 Cheapest supplier: <strong>{cheapestSupplier.name}</strong> at MVR {cheapestSupplier.min_cost.toFixed(2)}
                </div>
              )}
              {priceHistory.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 20, fontSize: 13 }}>No purchase history.</p>
              ) : (
                <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={TH}>Date</th><th style={TH}>Supplier</th>
                      <th style={TH}>PO</th>
                      <th style={TH}>Qty</th><th style={TH}>Unit Cost</th>
                    </tr></thead>
                    <tbody>
                      {priceHistory.map((h, i) => (
                        <tr key={i}>
                          <td style={TD}>{h.purchase_date ?? '—'}</td>
                          <td style={TD}>{h.supplier ?? '—'}</td>
                          <td style={TD}>
                            {h.purchase_id ? (
                              <Link
                                to={`/purchasing/orders?search=${encodeURIComponent(h.purchase_number || String(h.purchase_id))}`}
                                style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}
                              >
                                {h.purchase_number || `PO #${h.purchase_id}`}
                              </Link>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={TD}>{h.quantity}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>MVR {h.unit_cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ── Waste Tab ── */}
      {tab === 'waste' && canManage && (
        <Suspense fallback={<p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}>
          <WasteLogsPage embedded />
        </Suspense>
      )}
    </div>

    </PageShell>
  );
}
