import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Item, Modifier, Variant } from "../types";
import type { PosQuickLayout, PosQuickLayoutSource, PosQuickTab } from "../api";
import { effectiveItemPrice, originalItemPrice } from "../hooks/useCart";
import { useLongPress } from "../hooks/useLongPress";
import { isPackagingEligible, type PosOrderType } from "../orderTypes";
import { z } from "../theme";
import {
  autoTabKey, fitPillRow, flattenTabs, moveInList, newTabId, tabKey,
  type QuickScope, type ScopedQuickTab,
} from "../utils/quickTabs";
import { QuickKeyPrompt, type QuickKeyAction } from "./QuickKeyPrompt";
import { QuickTabPrompt, type QuickTabPromptResult, type QuickTabPromptState } from "./QuickTabPrompt";
import { looksLikeScanCode } from "../api/scan";

/** Room on a Quick tab, and tabs per layout. Mirror PosQuickKeyService. */
export const MAX_QUICK_KEYS = 24;
export const MAX_QUICK_TABS = 6;

type Props = {
  categories: Category[];
  /** null = "All items" tab (no category filter applied). */
  selectedCategoryId: number | null;
  setSelectedCategoryId: (id: number | null) => void;
  filteredItems: Item[];
  isLoading: boolean;
  dataError: string;

  selectedItem: Item | null;
  selectedModifiers: Modifier[];
  handleSelectItem: (item: Item) => void;
  toggleModifier: (mod: Modifier) => void;
  addToCart: (
    item: Item,
    opts?: {
      variant?: Variant | null;
      modifiers?: Modifier[];
      packagingOptionId?: number | null;
    },
  ) => void;
  clearSelectedItem: () => void;

  barcode: string;
  setBarcode: (v: string) => void;
  onBarcodeSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** Text typed or scanned into the search box that is a code, not a search. */
  onScanCode?: (code: string) => void;
  /** Open the camera scanner. */
  onOpenScanner?: () => void;
  /** When true the grid is dimmed and item taps are blocked — set
   *  while a held ticket is in "resumed" mode (cart is read-only). */
  readOnly?: boolean;

  /** Manual menu refresh — cashier tap pulls fresh categories + items
   *  from the server (useful when the owner adds a menu item mid-shift
   *  and the cashier can't wait for the 5-min auto-poll). */
  onRefreshMenu?: () => void;
  /** True while the manual refresh is in flight, so the button can
   *  spin and we can avoid stacking concurrent requests. */
  isRefreshingMenu?: boolean;
  /** Unix-ms timestamp of the last successful menu fetch, used for the
   *  "Updated 2m ago" status text next to the refresh button. */
  lastRefreshedAt?: number | null;

  /** Current ticket order type — packaging picker only for takeaway/pickup/delivery. */
  orderType: PosOrderType;

  /**
   * The Quick tabs (a cashier's own layout in front of the shared one) and
   * the Popular-now tab. Owner, 2026-09-02: "certain items are frequent in
   * certain times … each staff on his own" — then several tabs, renamed,
   * rearranged, switching by time of day, and copyable from a colleague.
   */
  quickLayout?: PosQuickLayout;
  canManageSharedQuickKeys?: boolean;
  onUpdateQuickLayout?: (scope: QuickScope, tabs: PosQuickTab[]) => void;
  onCopyQuickLayout?: (fromUserId: number) => Promise<boolean>;
  loadQuickLayoutSources?: () => Promise<PosQuickLayoutSource[]>;
  /** Item ids ranked by what sells at this hour, best first. */
  popularNow?: number[];
  /** A timed Quick tab only opens itself while nothing is on the ticket. */
  ticketEmpty?: boolean;
};

// Per-category colour swatches. Loyverse-style highly-saturated chips
// felt loud against the slate POS chrome (per audit). Instead we use
// muted modern tones — still distinct enough for fast scanning while
// reading as "one product" with the rest of the UI. `fg` is the
// readable accent text colour for that swatch; tiles render the
// category name in slate ink so contrast stays comfortable on white.
const TILE_PALETTE = [
  { bg: '#FEE2E2', fg: '#B91C1C' }, // soft red
  { bg: '#FFEDD5', fg: '#C2410C' }, // soft orange
  { bg: '#FEF3C7', fg: '#A16207' }, // soft amber
  { bg: '#ECFCCB', fg: '#3F6212' }, // soft lime
  { bg: '#D1FAE5', fg: '#047857' }, // soft green
  { bg: '#CCFBF1', fg: '#0F766E' }, // soft teal
  { bg: '#CFFAFE', fg: '#0E7490' }, // soft cyan
  { bg: '#DBEAFE', fg: '#1D4ED8' }, // soft blue
  { bg: '#E0E7FF', fg: '#4338CA' }, // soft indigo
  { bg: '#EDE9FE', fg: '#6D28D9' }, // soft violet
  { bg: '#FCE7F3', fg: '#BE185D' }, // soft pink
  { bg: '#E2E8F0', fg: '#334155' }, // soft slate
];

function tileColor(categoryId: number | null | undefined) {
  if (!categoryId) return TILE_PALETTE[0];
  return TILE_PALETTE[Math.abs(categoryId) % TILE_PALETTE.length];
}

/** Menu item tile — photo thumbnail when Image is set in Admin, else category colour chip. */
function MenuItemTile({
  item,
  readOnly,
  onClick,
  pinned = false,
  onLongPress,
}: {
  item: Item;
  readOnly?: boolean;
  onClick: () => void;
  /** On the Quick tab — drawn with a star so the cashier can tell. */
  pinned?: boolean;
  /** Press and hold: pin to / unpin from the Quick tab. */
  onLongPress?: () => void;
}) {
  const { handlers: holdHandlers, clickGuard } = useLongPress(onLongPress ?? (() => {}));
  const hold = onLongPress ? holdHandlers : {};
  const c = tileColor(item.category_id);
  const price = effectiveItemPrice(item);
  const wasPrice = originalItemPrice(item);
  const hasVariants = item.has_variants;
  const stockLeft = (() => {
    const n = item.availability?.available_stock;
    if (n == null || !Number.isFinite(Number(n))) return null;
    const qty = Number(n);
    // Untracked sentinel from StockReservationService.
    if (qty >= 9999) return null;
    return qty;
  })();
  const [imgFailed, setImgFailed] = useState(false);
  const imgSrc = item.image_url && !imgFailed ? item.image_url : null;

  return (
    <button
      type="button"
      onClick={onLongPress ? clickGuard(onClick) : onClick}
      disabled={readOnly}
      title={readOnly ? 'Resumed ticket is view-only. Cancel resume to edit.' : undefined}
      data-pinned={pinned ? 'true' : undefined}
      {...hold}
      style={{
        aspectRatio: '1 / 1',
        position: 'relative',
        background: imgSrc ? '#0F172A' : c.bg,
        color: c.fg,
        border: 'none',
        borderRadius: 12,
        padding: 0,
        cursor: readOnly ? 'not-allowed' : 'pointer',
        opacity: readOnly ? 0.45 : 1,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
        transition: 'transform 0.05s, box-shadow 0.12s',
        overflow: 'hidden',
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.10)'; }}
      onMouseOut={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.06)'; }}
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0, width: 4,
            background: c.fg,
            opacity: 0.85,
          }}
        />
      )}

      {pinned && (
        <span
          aria-hidden="true"
          title="On your Quick tab"
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 2,
            width: 22, height: 22, borderRadius: 999,
            background: 'rgba(255,255,255,0.92)', color: '#D4813A',
            fontSize: 13, lineHeight: '22px', textAlign: 'center',
            boxShadow: '0 1px 2px rgba(15,23,42,0.18)',
          }}
        >
          ★
        </span>
      )}

      {/* Bottom caption — gradient over photos so name/price stay readable */}
      <div
        style={{
          marginTop: 'auto',
          position: 'relative',
          zIndex: 1,
          padding: imgSrc ? '28px 10px 10px 12px' : '12px 12px 10px 14px',
          background: imgSrc
            ? 'linear-gradient(to top, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.55) 55%, transparent 100%)'
            : 'transparent',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 4,
          flex: 1,
          minHeight: 0,
        }}
      >
        <span style={{
          fontSize: 14, fontWeight: 700, lineHeight: 1.2,
          color: imgSrc ? '#FFFFFF' : '#0F172A',
          display: '-webkit-box', WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.name}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: imgSrc ? '#FDE68A' : c.fg,
          display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap',
        }}>
          {hasVariants && <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 600 }}>from</span>}
          MVR {price.toFixed(2)}
          {wasPrice != null && wasPrice > price && (
            <span style={{
              fontSize: 10, fontWeight: 600, opacity: 0.65, textDecoration: 'line-through',
              color: imgSrc ? 'rgba(255,255,255,0.7)' : undefined,
            }}>
              {wasPrice.toFixed(2)}
            </span>
          )}
        </span>
        {stockLeft != null && (
          <span
            data-testid="pos-stock-count"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: stockLeft <= 0
                ? (imgSrc ? '#FCA5A5' : '#B91C1C')
                : stockLeft <= 3
                  ? (imgSrc ? '#FDE68A' : '#B45309')
                  : (imgSrc ? 'rgba(255,255,255,0.85)' : '#64748B'),
            }}
          >
            {stockLeft <= 0 ? 'Sold out' : `${stockLeft} left`}
          </span>
        )}
      </div>
    </button>
  );
}

type SaleFilter = 'all' | 'discount' | 'special' | 'catering' | 'quick' | 'popular';

/** Items in the order a list of ids gives, skipping ids no longer on the menu. */
function itemsInOrder(ids: number[], items: Item[]): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is Item => i !== undefined);
}

function isPercentDiscountItem(item: Item): boolean {
  if (item.special?.discount_pct != null && item.special.discount_pct > 0) return true;
  return (item.variants ?? []).some(
    (v) => v.effective_price != null && v.original_price != null && v.effective_price < v.original_price,
  );
}

function isFixedSpecialItem(item: Item): boolean {
  if (item.special?.effective_price != null && (item.special.discount_pct == null || item.special.discount_pct <= 0)) {
    return true;
  }
  return !!item.special && !isPercentDiscountItem(item);
}

/** The sub-category row, which is short and may still scroll. */
const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  overflowX: 'auto',
  paddingBottom: 4,
  flexShrink: 0,
  scrollbarWidth: 'thin',
};

/**
 * The main strip. Owner, 2026-09-03: "keep fixed to the screen." It fits the
 * width instead of scrolling sideways, so a tab is never off-screen with
 * nothing to say so — what does not fit sits behind More.
 */
const stripRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  overflow: 'hidden',
  paddingBottom: 4,
  flexShrink: 0,
};

/** The pills between the pinned "All items" and "More". */
const stripMiddleStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
};

/** One pill on the strip, wherever it ends up: on the row or behind More. */
type StripPill = {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
  caret?: boolean;
  muted?: boolean;
  /** Set for a cashier's quick tab, which is drawn and held differently. */
  quick?: { shared: boolean; onLongPress?: () => void; hint?: string };
};

function renderStripPill(p: StripPill, afterClick?: () => void) {
  const onClick = afterClick ? () => { p.onClick(); afterClick(); } : p.onClick;

  return p.quick ? (
    <QuickTabPill
      key={p.key}
      label={p.label}
      active={p.active}
      shared={p.quick.shared}
      onClick={onClick}
      onLongPress={p.quick.onLongPress}
      hint={p.quick.hint}
    />
  ) : (
    <CategoryPill
      key={p.key}
      label={p.label}
      active={p.active}
      onClick={onClick}
      caret={p.caret}
      muted={p.muted}
    />
  );
}

function CategoryPill({
  label,
  active,
  onClick,
  caret = false,
  subtle = false,
  muted = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  caret?: boolean;
  subtle?: boolean;
  /** De-emphasized end-of-strip tab (Events & Catering). */
  muted?: boolean;
}) {
  const inactiveBg = muted ? '#F8FAFC' : subtle ? '#F1F5F9' : '#FFFFFF';
  const inactiveBorder = muted ? '#CBD5E1' : '#E2E8F0';
  const inactiveColor = muted ? '#64748B' : '#0F172A';
  return (
    <button
      onClick={onClick}
      style={{
        padding: subtle || muted ? '6px 12px' : '8px 16px',
        borderRadius: muted ? 10 : 999,
        border: `1px solid ${active ? '#B86820' : inactiveBorder}`,
        background: active ? '#D4813A' : inactiveBg,
        color: active ? '#FFFFFF' : inactiveColor,
        fontSize: subtle || muted ? 11 : 13,
        fontWeight: muted ? 600 : 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        // The strip is clipped, not scrolled, so a pill must keep its size
        // rather than squeeze its label (owner, 2026-09-03).
        flexShrink: 0,
        minHeight: subtle || muted ? 30 : 36,
        boxShadow: active ? '0 1px 3px rgba(212,129,58,0.35)' : 'none',
        transition: 'background 0.12s, box-shadow 0.12s',
        opacity: muted && !active ? 0.92 : 1,
      }}
    >
      <span>{label}</span>
      {caret && (
        <span
          aria-hidden="true"
          style={{
            fontSize: 9,
            opacity: 0.65,
            transform: 'translateY(1px)',
          }}
        >
          ▾
        </span>
      )}
    </button>
  );
}

/**
 * A Quick tab's pill. Same look as a category pill, with the hold gesture
 * that opens rename / hours / move / delete, and a dotted edge on shared
 * tabs so a cashier can tell theirs from the house's.
 */
function QuickTabPill({
  label, active, shared, onClick, onLongPress, hint,
}: {
  label: string;
  active: boolean;
  shared: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  hint?: string;
}) {
  const { handlers, clickGuard } = useLongPress(onLongPress ?? (() => {}));
  return (
    <button
      type="button"
      onClick={onLongPress ? clickGuard(onClick) : onClick}
      title={hint ?? (onLongPress ? 'Press and hold to rename, set hours, move or delete' : undefined)}
      data-testid="quick-tab-pill"
      data-shared={shared ? 'true' : undefined}
      {...(onLongPress ? handlers : {})}
      style={{
        padding: '8px 16px',
        borderRadius: 999,
        border: `1px ${shared ? 'dashed' : 'solid'} ${active ? '#B86820' : '#E2E8F0'}`,
        background: active ? '#D4813A' : '#FFF7ED',
        color: active ? '#FFFFFF' : '#9A3412',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        minHeight: 36,
        boxShadow: active ? '0 1px 3px rgba(212,129,58,0.35)' : 'none',
        transition: 'background 0.12s, box-shadow 0.12s',
      }}
    >
      {label}
    </button>
  );
}

const C = {
  panel: '#FFFFFF',
  border: '#E2E8F0',
  border2: '#CBD5E1',
  text: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  bg: '#F8FAFC',
  primary: '#D4813A',
  primaryDark: '#B86820',
};

/**
 * Human-readable "Updated X ago" string for the menu refresh hint.
 * Kept short so it doesn't overflow the topbar on narrow tablets.
 */
function formatAgo(ts: number | null | undefined): string {
  if (!ts) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Bug-024: the freshness label used to live inside MenuGrid with a
 * 20s `setTick` interval at the top of the component — which meant
 * the ENTIRE menu grid (categories, items, modifier sheet, search
 * memos) was re-rendered every 20s just so a six-character string
 * ("2m ago") could advance. On a 200+ item menu that's a noticeable
 * jank on iPad. Now the tick lives inside this tiny component, so
 * only this <span> re-renders.
 */
function FreshnessLabel({ ts, busy }: { ts: number | null; busy: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!ts) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 20_000);
    return () => window.clearInterval(id);
  }, [ts]);
  return <>{busy ? 'Refreshing…' : ts ? `Updated ${formatAgo(ts)}` : 'Refresh'}</>;
}

export function MenuGrid({
  categories, selectedCategoryId, setSelectedCategoryId, filteredItems,
  isLoading, dataError, selectedItem, selectedModifiers,
  handleSelectItem, toggleModifier, addToCart, clearSelectedItem,
  barcode, setBarcode, onBarcodeSubmit, onScanCode, onOpenScanner, readOnly = false,
  onRefreshMenu, isRefreshingMenu = false, lastRefreshedAt = null,
  orderType,
  quickLayout, canManageSharedQuickKeys = false, onUpdateQuickLayout, onCopyQuickLayout, loadQuickLayoutSources,
  popularNow = [],
  ticketEmpty = true,
}: Props) {
  const packagingEligible = isPackagingEligible(orderType);  // Bug-024: the per-20s freshness tick lives inside <FreshnessLabel>
  // now, NOT here at the top of MenuGrid. Re-rendering the entire
  // menu (300+ items, modifier sheets, search memos) every 20s just
  // to advance a "2m ago" string was visible jank on iPad. The label
  // self-rotates without involving the rest of the grid.
  const [search, setSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("all");

  // ── Quick tabs ─────────────────────────────────────────────────────────────
  // The cashier's own tabs, then the shared ones, each a pill in front of the
  // categories. A tab with hours opens itself when they start.
  const quickEnabled = !!quickLayout && !!onUpdateQuickLayout;
  const myTabs = useMemo(() => quickLayout?.mine ?? [], [quickLayout]);
  const sharedTabs = useMemo(() => quickLayout?.shared ?? [], [quickLayout]);
  const allTabs = useMemo(() => flattenTabs({ mine: myTabs, shared: sharedTabs }), [myTabs, sharedTabs]);
  const editableTabs = useMemo(
    () => allTabs.filter((t) => t.scope === "mine" || canManageSharedQuickKeys),
    [allTabs, canManageSharedQuickKeys],
  );
  const pinnedIds = useMemo(() => new Set(allTabs.flatMap((t) => t.items)), [allTabs]);

  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const activeTab = allTabs.find((t) => tabKey(t.scope, t.id) === activeTabKey) ?? null;

  const openTab = (tab: ScopedQuickTab) => {
    setSelectedCategoryId(null);
    setActiveTabKey(tabKey(tab.scope, tab.id));
    setSaleFilter('quick');
  };

  // A tab that vanished — deleted here, or the layout changed elsewhere —
  // must not leave the grid filtering on nothing.
  useEffect(() => {
    if (saleFilter === 'quick' && activeTabKey && !activeTab) {
      setActiveTabKey(null);
      setSaleFilter('all');
    }
  }, [saleFilter, activeTabKey, activeTab]);

  // Time of day. The clock ticks once a minute; when the tab that should be
  // open changes, the till switches to it. A cashier who then picks
  // something else is left alone until the next tab's hours start.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const autoKey = useMemo(() => autoTabKey(allTabs, new Date(clock)), [allTabs, clock]);
  const lastAutoRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoKey === lastAutoRef.current) return;
    // Never mid-ticket: a cashier half-way through an order at 11:00 sharp
    // must not lose their place. The switch waits for the ticket to clear.
    if (!ticketEmpty) return;
    lastAutoRef.current = autoKey;
    if (!autoKey) return;
    const tab = allTabs.find((t) => tabKey(t.scope, t.id) === autoKey);
    if (tab) openTab(tab);
    // openTab is a plain closure over setters; allTabs is what autoKey derives from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, ticketEmpty]);

  const [quickPromptItem, setQuickPromptItem] = useState<Item | null>(null);
  const [tabPrompt, setTabPrompt] = useState<QuickTabPromptState | null>(null);

  const saveScope = (scope: QuickScope, tabs: PosQuickTab[]) => onUpdateQuickLayout?.(scope, tabs);
  const tabsOf = (scope: QuickScope) => (scope === "mine" ? myTabs : sharedTabs);

  const applyQuickKeyAction = (item: Item, action: QuickKeyAction) => {
    if (action.kind === "add-new") {
      const tab: PosQuickTab = { id: newTabId(myTabs), name: "Quick", items: [item.id], from: null, to: null };
      saveScope("mine", [...myTabs, tab]);
      setQuickPromptItem(null);
      return;
    }
    const current = tabsOf(action.scope);
    const next = current.map((tab) => {
      if (tab.id !== action.tabId) return tab;
      if (action.kind === "add" && !tab.items.includes(item.id)) {
        return { ...tab, items: [...tab.items, item.id].slice(0, MAX_QUICK_KEYS) };
      }
      if (action.kind === "remove") return { ...tab, items: tab.items.filter((id) => id !== item.id) };
      if (action.kind === "move") return { ...tab, items: moveInList(tab.items, tab.items.indexOf(item.id), action.delta) };
      return tab;
    });
    saveScope(action.scope, next);
    setQuickPromptItem(null);
  };

  const applyTabPromptResult = (result: QuickTabPromptResult) => {
    if (!tabPrompt) return;
    if (result.kind === "copy") {
      void onCopyQuickLayout?.(result.fromUserId).then(() => setTabPrompt(null));
      return;
    }
    if (result.kind === "create") {
      const list = tabsOf(result.scope);
      if (list.length >= MAX_QUICK_TABS) { setTabPrompt(null); return; }
      const tab: PosQuickTab = { id: newTabId(list), name: result.name, items: [], from: result.from, to: result.to };
      saveScope(result.scope, [...list, tab]);
      openTab({ ...tab, scope: result.scope });
      setTabPrompt(null);
      return;
    }
    if (tabPrompt.mode !== "edit") return;
    const { tab, index } = tabPrompt;
    const list = tabsOf(tab.scope);
    if (result.kind === "save") {
      saveScope(tab.scope, list.map((t) => (t.id === tab.id ? { ...t, name: result.name, from: result.from, to: result.to } : t)));
    }
    if (result.kind === "move") saveScope(tab.scope, moveInList(list, index, result.delta));
    if (result.kind === "delete") {
      saveScope(tab.scope, list.filter((t) => t.id !== tab.id));
      if (activeTabKey === tabKey(tab.scope, tab.id)) { setActiveTabKey(null); setSaleFilter('all'); }
    }
    setTabPrompt(null);
  };

  // ── Category strip overflow ───────────────────────────────────────────────
  // Owner, 2026-09-02: "show all other actual categories when clicked more
  // if there is no space". The row's width is watched; categories that do
  // not fit go behind a More pill.
  const pillRowRef = useRef<HTMLDivElement>(null);
  const [pillRowWidth, setPillRowWidth] = useState(0);
  useEffect(() => {
    const el = pillRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setPillRowWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [moreOpen, setMoreOpen] = useState(false);

  // ── Category hierarchy ─────────────────────────────────────────────────────
  // The DB supports `parent_id` on categories (one level of nesting). The old
  // POS rendered them as a flat pill row, so parents and children sat next
  // to each other with no visual relationship — and an item under a sub-
  // category was unreachable unless you knew which leaf to tap. We now
  // render:
  //   1. A primary pill row with "All" + every TOP-LEVEL category, sorted
  //      by sort_order then name.
  //   2. A secondary pill row showing the children of the currently-selected
  //      top-level (only when that top-level has children). Includes an
  //      "All ‹parent›" pill so the cashier can opt back into the parent
  //      view.
  // Items belonging to a sub-category are mapped up to the parent for
  // filtering purposes — selecting the parent shows everything under it,
  // selecting a child narrows to that leaf only.
  const childrenByParent = useMemo(() => {
    const map = new Map<number, Category[]>();
    for (const c of categories) {
      if (c.parent_id != null) {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    const sortFn = (a: Category, b: Category) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
    for (const [k, arr] of map) map.set(k, [...arr].sort(sortFn));
    return map;
  }, [categories]);

  const topLevelCategories = useMemo(() => {
    const sortFn = (a: Category, b: Category) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
    return categories.filter((c) => c.parent_id == null).sort(sortFn);
  }, [categories]);

  // Map every category id → its top-level ancestor (itself if already a root).
  const ancestorOf = useMemo(() => {
    const map = new Map<number, number>();
    const byId = new Map(categories.map((c) => [c.id, c]));
    for (const c of categories) {
      let cur: Category | undefined = c;
      // Walk up the chain (defensive guard against accidental cycles).
      for (let i = 0; i < 16 && cur && cur.parent_id != null; i++) {
        const parent = byId.get(cur.parent_id);
        if (!parent) break;
        cur = parent;
      }
      map.set(c.id, cur?.id ?? c.id);
    }
    return map;
  }, [categories]);

  // Determine which top-level pill should be marked active, and what
  // children (if any) to show in the secondary row.
  const activeTopLevelId = useMemo(() => {
    if (selectedCategoryId == null) return null;
    return ancestorOf.get(selectedCategoryId) ?? selectedCategoryId;
  }, [selectedCategoryId, ancestorOf]);

  const activeChildren = useMemo(() => {
    if (activeTopLevelId == null) return [];
    return childrenByParent.get(activeTopLevelId) ?? [];
  }, [activeTopLevelId, childrenByParent]);

  const discountCount = useMemo(
    () => filteredItems.filter(isPercentDiscountItem).length,
    [filteredItems],
  );
  const specialCount = useMemo(
    () => filteredItems.filter(isFixedSpecialItem).length,
    [filteredItems],
  );
  const cateringCount = useMemo(
    () => filteredItems.filter((i) => !!i.is_catering).length,
    [filteredItems],
  );

  const saleScopedItems = useMemo(() => {
    if (saleFilter === 'discount') return filteredItems.filter(isPercentDiscountItem);
    if (saleFilter === 'special') return filteredItems.filter(isFixedSpecialItem);
    if (saleFilter === 'catering') return filteredItems.filter((i) => !!i.is_catering);
    // Both tabs clear the category, so filteredItems is the whole channel
    // menu here — and the order is the tab's own, not the admin's.
    if (saleFilter === 'quick') return itemsInOrder(activeTab?.items ?? [], filteredItems);
    if (saleFilter === 'popular') return itemsInOrder(popularNow, filteredItems);
    return filteredItems;
  }, [filteredItems, saleFilter, activeTab, popularNow]);

  const popularCount = useMemo(
    () => (popularNow.length > 0 ? itemsInOrder(popularNow, filteredItems).length : 0),
    [popularNow, filteredItems],
  );

  // Cross-category text search: when the cashier types in the search box we
  // ignore the category filter so common items can be reached quickly. The
  // search box doubles as the barcode input — form submit looks up the SKU.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return saleScopedItems;
    // Fall back to saleScopedItems when nothing matches — that's the right
    // behaviour when the search field is being used as a barcode buffer.
    return saleScopedItems.filter((it) => it.name.toLowerCase().includes(q));
  }, [saleScopedItems, search]);

  return (
    <section className="pos-menu">
      {/* Top bar: search + barcode form */}
      <div className="pos-menu-toolbar">
        <form
          className="pos-menu-search-form"
          onSubmit={(e) => {
            if (barcode.trim()) { onBarcodeSubmit(e); return; }
            e.preventDefault();
            // A gun typing a gift card or discount card into the search box
            // lands here with letters in it; it is a code, not a search.
            if (onScanCode && looksLikeScanCode(search)) {
              onScanCode(search);
              setSearch("");
            }
          }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: C.subtle, fontSize: 14, pointerEvents: 'none',
            }}>🔍</span>
            <input
              value={search || barcode}
              onChange={(e) => {
                const v = e.target.value;
                // Treat purely numeric / dash entries as a barcode (so a scanner
                // can dump straight into this single field). Anything else is
                // free-text search across the visible category.
                if (/^[0-9\- ]+$/.test(v)) {
                  setBarcode(v);
                  setSearch("");
                } else {
                  setSearch(v);
                  setBarcode("");
                }
              }}
              placeholder="Search items or scan barcode…"
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                borderRadius: 8, border: `1px solid ${C.border2}`,
                fontSize: 14, background: '#FFFFFF', color: C.text,
                boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          {barcode.trim() && (
            <button
              type="submit"
              style={{
                padding: '0 16px', borderRadius: 8, border: 'none',
                background: C.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          )}
        </form>
        {onOpenScanner && (
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="Scan with the camera"
            title="Scan a barcode or QR code with the camera"
            style={{
              flexShrink: 0, minWidth: 44, minHeight: 44, borderRadius: 8,
              border: `1px solid ${C.border2}`, background: '#FFFFFF', color: C.text,
              fontSize: 18, cursor: 'pointer',
            }}
          >
            📷
          </button>
        )}

        {/* Manual menu refresh — for when the owner adds an item mid-
            shift and the cashier wants it now rather than waiting for
            the 5-min auto-poll. The button is intentionally subtle:
            most cashiers will never need it because of the silent
            background poll + tab-focus refetch already running. */}
        {onRefreshMenu && (
          <button
            type="button"
            className="pos-menu-refresh-btn"
            onClick={() => onRefreshMenu()}
            disabled={isRefreshingMenu}
            title={lastRefreshedAt ? `Tap to refresh the menu` : 'Refresh menu now'}
            aria-label="Refresh menu"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              height: 40,
              borderRadius: 8,
              border: `1px solid ${C.border2}`,
              background: '#FFFFFF',
              color: C.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: isRefreshingMenu ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.12s',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                fontSize: 14,
                lineHeight: 1,
                // Spin while a refresh is in flight so the cashier sees
                // something is happening even on a slow connection.
                animation: isRefreshingMenu ? 'pos-spin 0.8s linear infinite' : undefined,
              }}
            >
              ↻
            </span>
            <span
              className="pos-refresh-label"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.subtle,
                // Hidden on narrow viewports via index.css media query;
                // visible on tablets/desktop where there's room.
                display: 'none',
              }}
            >
              <FreshnessLabel ts={lastRefreshedAt} busy={isRefreshingMenu} />
            </span>
          </button>
        )}
      </div>

      {/* Category + sale filters in one row (avoids duplicate "All items"). */}
      {(topLevelCategories.length > 0 || discountCount > 0 || specialCount > 0 || cateringCount > 0 || quickEnabled) && (() => {
        // Owner, 2026-09-03: the strip fits the screen instead of scrolling
        // sideways — "All items" pinned at the left, "More" pinned at the
        // right, and as much as fits in between. Anything that does not fit
        // is behind More, so nothing is off-screen with no sign of it.
        //
        // Order is by how often a hand reaches for it: the cashier's own
        // tabs, what is selling now, the categories, then the sale filters.
        // "+ Tab" is a setup action, not a filter, so it always lives in
        // More however much room there is.
        const canAddOwnTab = quickEnabled && myTabs.length < MAX_QUICK_TABS;
        const quickLabel = (t: ScopedQuickTab) => `★ ${t.name}${t.items.length > 0 ? ` (${t.items.length})` : ''}`;

        const strip: StripPill[] = [
          ...allTabs.map((tab, index) => ({
            key: tabKey(tab.scope, tab.id),
            label: quickLabel(tab),
            active: saleFilter === 'quick' && activeTabKey === tabKey(tab.scope, tab.id),
            onClick: () => {
              if (saleFilter === 'quick' && activeTabKey === tabKey(tab.scope, tab.id)) {
                setActiveTabKey(null);
                setSaleFilter('all');
              } else {
                openTab(tab);
              }
            },
            quick: {
              shared: tab.scope === 'shared',
              onLongPress:
                tab.scope === 'mine' || canManageSharedQuickKeys
                  ? () => setTabPrompt({
                    mode: 'edit', tab,
                    index: tabsOf(tab.scope).findIndex((t) => t.id === tab.id),
                    count: tabsOf(tab.scope).length,
                  })
                  : undefined,
              hint: index === 0 && allTabs.length === 1 ? 'Hold to rename or move' : undefined,
            },
          })),
          ...(popularCount > 0 ? [{
            key: 'popular',
            label: `🔥 Now (${popularCount})`,
            active: saleFilter === 'popular',
            onClick: () => {
              setSelectedCategoryId(null);
              setSaleFilter((f) => (f === 'popular' ? 'all' : 'popular'));
            },
          }] : []),
          ...topLevelCategories.map((cat) => ({
            key: `cat-${cat.id}`,
            label: cat.name,
            active: activeTopLevelId === cat.id && saleFilter === 'all',
            onClick: () => {
              setSelectedCategoryId(cat.id);
              setSaleFilter('all');
            },
            caret: (childrenByParent.get(cat.id)?.length ?? 0) > 0,
          })),
          ...(discountCount > 0 ? [{
            key: 'discount',
            label: `% Off (${discountCount})`,
            active: saleFilter === 'discount',
            onClick: () => {
              setSelectedCategoryId(null);
              setSaleFilter((f) => (f === 'discount' ? 'all' : 'discount'));
            },
          }] : []),
          ...(specialCount > 0 ? [{
            key: 'special',
            label: `Specials (${specialCount})`,
            active: saleFilter === 'special',
            onClick: () => {
              setSelectedCategoryId(null);
              setSaleFilter((f) => (f === 'special' ? 'all' : 'special'));
            },
          }] : []),
          ...(cateringCount > 0 ? [{
            key: 'catering',
            label: `Events & Catering (${cateringCount})`,
            active: saleFilter === 'catering',
            muted: true,
            onClick: () => {
              // Clear the category so the list is catering ∧ current channel
              // across the whole menu.
              setSelectedCategoryId(null);
              setSaleFilter((f) => (f === 'catering' ? 'all' : 'catering'));
            },
          }] : []),
        ];

        const fit = fitPillRow(pillRowWidth, 'All items', strip.map((p) => p.label), {
          moreLabel: `More (${strip.length})`,
        });
        let visible = fit.visible.map((i) => strip[i]);
        let hidden = fit.hidden.map((i) => strip[i]);
        // Whatever is switched on keeps a pill of its own rather than hiding
        // behind More: it swaps in for the last one that fits.
        const activeHidden = hidden.find((p) => p.active);
        if (activeHidden && visible.length > 0) {
          const bumped = visible[visible.length - 1];
          visible = [...visible.slice(0, -1), activeHidden];
          hidden = [bumped, ...hidden.filter((p) => p.key !== activeHidden.key)];
        }
        const showMore = hidden.length > 0 || canAddOwnTab;

        return (
        <>
        <div ref={pillRowRef} style={stripRowStyle} data-testid="pos-pill-row">
          <CategoryPill
            label="All items"
            active={selectedCategoryId == null && saleFilter === 'all'}
            onClick={() => {
              setSelectedCategoryId(null);
              setSaleFilter('all');
            }}
          />
          <div style={stripMiddleStyle}>
            {visible.map((p) => renderStripPill(p))}
          </div>
          {showMore && (
            <CategoryPill
              label={hidden.length > 0 ? `More (${hidden.length})` : 'More'}
              active={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
              caret
            />
          )}
        </div>
        {moreOpen && showMore && (
          <div
            role="group"
            aria-label="More categories"
            data-testid="pos-more-categories"
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: 10, marginTop: 2, borderRadius: 12,
              background: C.bg, border: `1px solid ${C.border}`,
            }}
          >
            {hidden.map((p) => renderStripPill(p, () => setMoreOpen(false)))}
            {canAddOwnTab && (
              <CategoryPill
                label="+ Tab"
                active={false}
                subtle
                onClick={() => {
                  setMoreOpen(false);
                  setTabPrompt({ mode: 'new', scope: 'mine' });
                }}
              />
            )}
          </div>
        )}
        </>
        );
      })()}

      {/* Secondary pill row: sub-categories of the active parent. Hidden
          when the active selection has no children. */}
      {activeChildren.length > 0 && (
        <div style={{ ...pillRowStyle, marginTop: -2 }}>
          <CategoryPill
            label={`All ${
              topLevelCategories.find((c) => c.id === activeTopLevelId)?.name ?? ''
            }`}
            active={selectedCategoryId === activeTopLevelId}
            onClick={() => setSelectedCategoryId(activeTopLevelId)}
            subtle
          />
          {activeChildren.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              active={selectedCategoryId === cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              subtle
            />
          ))}
        </div>
      )}

      {/* Errors / loading */}
      {dataError && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#92400E',
        }}>
          {dataError}
        </div>
      )}
      {isLoading && (
        <div style={{
          background: '#FFFFFF', border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.muted,
        }}>
          Loading menu…
        </div>
      )}

      {/* Item tile grid */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        background: C.panel, borderRadius: 12,
        border: `1px solid ${C.border}`, padding: 12,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}>
        {visibleItems.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 40, color: C.subtle, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🍽️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>
              {search ? 'No items match your search' : 'No items in this category'}
            </div>
          </div>
        ) : (
          <div className="pos-menu-grid">
            {visibleItems.map((item) => {
              const hasMods = (item.modifiers?.length ?? 0) > 0;
              const hasVariants = item.has_variants;
              const hasPackagingChoices =
                packagingEligible && (item.packaging_options?.length ?? 0) > 1;
              // For items without modifiers, variants, or packaging choices,
              // tap = direct add to cart. Otherwise open configure.
              // Dine-in never counts packaging as a configure reason.
              const onClick = () => {
                if (readOnly) return;
                if (hasMods || hasVariants || hasPackagingChoices) handleSelectItem(item);
                else addToCart(item);
              };
              return (
                <MenuItemTile
                  key={item.id}
                  item={item}
                  readOnly={readOnly}
                  onClick={onClick}
                  pinned={quickEnabled && pinnedIds.has(item.id)}
                  onLongPress={quickEnabled ? () => setQuickPromptItem(item) : undefined}
                />
              );
            })}
          </div>
        )}
        {saleFilter === 'quick' && quickEnabled && visibleItems.length === 0 && !search && (
          <p data-testid="quick-empty" style={{ margin: '12px 4px', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            Nothing on this tab yet. Press and hold any item on the menu to add it here.
          </p>
        )}
      </div>

      {quickPromptItem && quickLayout && (
        <QuickKeyPrompt
          item={quickPromptItem}
          tabs={editableTabs}
          maxItems={MAX_QUICK_KEYS}
          canAddOwnTab={myTabs.length < MAX_QUICK_TABS}
          onAction={(action) => applyQuickKeyAction(quickPromptItem, action)}
          onClose={() => setQuickPromptItem(null)}
        />
      )}

      {tabPrompt && quickLayout && (
        <QuickTabPrompt
          state={tabPrompt}
          canManageShared={canManageSharedQuickKeys}
          loadSources={onCopyQuickLayout ? loadQuickLayoutSources : undefined}
          onResult={applyTabPromptResult}
          onClose={() => setTabPrompt(null)}
        />
      )}

      {/* Configure modal — modifiers / variants / packaging choices */}
      {selectedItem && (
        <ConfigurePanel
          item={selectedItem}
          selectedModifiers={selectedModifiers}
          toggleModifier={toggleModifier}
          packagingEligible={packagingEligible}
          onAdd={(variant, packagingOptionId) => {
            addToCart(selectedItem, {
              variant: variant ?? undefined,
              packagingOptionId: packagingEligible ? packagingOptionId : null,
            });
            clearSelectedItem();
          }}
          onClose={clearSelectedItem}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Centered modal for choosing size/variant + modifiers before adding to cart.
// Centered (not a bottom sheet) so it stays in the thumb/eye zone on iPad
// portrait and phone — the old flex-end dock sat under the cart dock.

function ConfigurePanel({
  item,
  selectedModifiers,
  toggleModifier,
  packagingEligible,
  onAdd,
  onClose,
}: {
  item: Item;
  selectedModifiers: Modifier[];
  toggleModifier: (m: Modifier) => void;
  /** False for dine-in — hide packaging picker and attach no option. */
  packagingEligible: boolean;
  /** When the item has variants, the chosen variant is passed back so
   *  the cart can record the correct id/name/price. For items without
   *  variants we pass `null` and `addToCart` falls back to base_price. */
  onAdd: (variant: Variant | null, packagingOptionId?: number | null) => void;
  onClose: () => void;
}) {
  const c = tileColor(item.category_id);
  const mods = item.modifiers ?? [];
  const packagingOptions = useMemo(
    () => (item.packaging_options ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [item],
  );
  const showPackagingPicker = packagingEligible && packagingOptions.length > 1;
  const variants = useMemo(
    () => (item.has_variants ? (item.variants ?? []).filter((v) => v.is_active) : []),
    [item],
  );

  // One-tap commit when packaging OR variants are the sole choice
  // (no modifiers, and not both). Mirrors the existing variant UX so
  // packaging-only items don't need a second "Add to ticket" tap.
  const oneTapVariant = item.has_variants && mods.length === 0 && !showPackagingPicker;
  const oneTapPackaging = showPackagingPicker && !item.has_variants && mods.length === 0;
  const oneTapMode = oneTapVariant || oneTapPackaging;
  const [chosenVariantId, setChosenVariantId] = useState<number | null>(() => {
    if (!item.has_variants) return null;
    if (oneTapVariant) return null;
    // Never land on a size the ingredient pool can no longer cover.
    const def = variants.find((v) => v.is_available !== false) ?? variants[0];
    return def?.id ?? null;
  });
  const [chosenPackagingId, setChosenPackagingId] = useState<number | null>(() => {
    if (!packagingEligible || oneTapPackaging) return null;
    return packagingOptions.find((o) => o.is_default)?.id ?? packagingOptions[0]?.id ?? null;
  });

  const chosenVariant = variants.find((v) => v.id === chosenVariantId) ?? null;

  // Headline price reflects the currently-chosen variant (or base price
  // when there are no variants). Keeps the modal honest about what will
  // hit the receipt. In variant one-tap with nothing yet chosen we show
  // "from X" using the cheapest variant so the cashier sees the price
  // range up-front. Packaging-only one-tap uses base item price (fees
  // are on the option chips).
  const headlinePrice = chosenVariant
    ? Number(chosenVariant.effective_price ?? chosenVariant.price)
    : oneTapVariant && variants.length > 0
      ? Math.min(
        ...(variants.filter((v) => v.is_available !== false).length > 0
          ? variants.filter((v) => v.is_available !== false)
          : variants
        ).map((v) => Number(v.effective_price ?? v.price)),
      )
      : effectiveItemPrice(item);
  const headlineOriginal = chosenVariant
    ? (chosenVariant.effective_price != null && chosenVariant.original_price != null
      ? Number(chosenVariant.original_price)
      : null)
    : originalItemPrice(item);

  const needsVariant = item.has_variants && variants.length > 0 && chosenVariantId == null;
  const canAdd = !needsVariant;

  return (
    <div
      className="pos-configure-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        background: 'rgba(15,23,42,0.45)',
        zIndex: z.modalBackdrop,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${item.name}`}
    >
      <div
        className="pos-configure-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          boxShadow: '0 20px 48px rgba(15,23,42,0.22)',
        }}
      >
        {/* Header tile */}
        <div style={{
          background: c.bg, color: c.fg, padding: '18px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, gap: 12,
        }}>
          {item.image_url && (
            <img
              src={item.image_url}
              alt=""
              style={{
                width: 52, height: 52, borderRadius: 10, objectFit: 'cover',
                flexShrink: 0, border: '2px solid rgba(255,255,255,0.55)',
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div style={{ minWidth: 0, paddingRight: 12, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
              {oneTapVariant && !chosenVariant ? 'from ' : ''}MVR {headlinePrice.toFixed(2)}
              {headlineOriginal != null && headlineOriginal > headlinePrice && (
                <span style={{ marginLeft: 6, textDecoration: 'line-through', opacity: 0.75, fontSize: 12 }}>
                  {headlineOriginal.toFixed(2)}
                </span>
              )}
              {chosenVariant && (
                <span style={{ marginLeft: 8, opacity: 0.85 }}>· {chosenVariant.name}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.55)',
              color: c.fg,
              border: 'none', width: 44, height: 44, borderRadius: 999,
              fontSize: 22, lineHeight: 1, cursor: 'pointer',
              fontWeight: 700, flexShrink: 0,
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto', flex: 1, display: 'grid', gap: 18 }}>
          {/* Variant picker — radio-style. Mandatory when the item has
              variants; otherwise the section is omitted entirely.
              Previously this block just said "the default variant will
              be added", which meant cashiers physically could not ring
              up Medium or Large.

              UX shortcut: when the item has variants but NO modifiers,
              tapping a variant adds the line straight to the ticket
              (no second "Add" tap). When modifiers also exist we just
              select the variant — the cashier still needs to pick
              their mods before the Add button completes the line. */}
          {item.has_variants && (
            <div>
              <div style={sectionLabel}>
                Size / Option
                {oneTapVariant && variants.length > 0 && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.subtle,
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}>
                    · tap to add
                  </span>
                )}
              </div>
              {variants.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted }}>
                  No active variants — ask a manager to enable at least one.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 8,
                }}>
                  {variants.map((v) => {
                    const active = chosenVariantId === v.id;
                    // Sizes share one pool of ingredients and draw on it at
                    // different rates, so a half portion outlives a full one.
                    const soldOut = v.is_available === false;
                    return (
                      <button
                        key={v.id}
                        disabled={soldOut}
                        title={soldOut ? `${v.name} is sold out` : undefined}
                        onClick={() => {
                          if (soldOut) return;
                          setChosenVariantId(v.id);
                          if (oneTapVariant) onAdd(v, chosenPackagingId);
                        }}
                        style={{
                          padding: '14px 14px',
                          borderRadius: 10,
                          border: `2px solid ${active ? C.text : C.border2}`,
                          background: active ? C.text : '#FFFFFF',
                          color: active ? '#FFFFFF' : C.text,
                          opacity: soldOut ? 0.45 : 1,
                          cursor: soldOut ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          minHeight: 64,
                          transition: 'transform 60ms ease, box-shadow 120ms ease',
                          boxShadow: active ? '0 2px 8px rgba(15,23,42,0.18)' : 'none',
                        }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                        onMouseUp={(e) => (e.currentTarget.style.transform = '')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
                      >
                        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
                          {v.name}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          opacity: active ? 0.95 : 0.85,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {soldOut ? 'Sold out' : `MVR ${Number(v.effective_price ?? v.price).toFixed(2)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Modifier picker — toggle chips. Hidden when there are no
              modifiers, so a variant-only item gets a clean variant
              picker with no awkward empty section underneath. */}
          {mods.length > 0 && (
            <div>
              <div style={sectionLabel}>Modifiers</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {mods.map((m) => {
                  const active = selectedModifiers.some((x) => x.id === m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModifier(m)}
                      style={{
                        padding: '10px 14px', borderRadius: 999,
                        border: `1px solid ${active ? C.text : C.border2}`,
                        background: active ? C.text : '#FFFFFF',
                        color: active ? '#FFFFFF' : C.text,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {m.name}{Number(m.price) > 0 ? ` +${Number(m.price).toFixed(2)}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showPackagingPicker && (
            <div>
              <div style={sectionLabel}>
                Packaging
                {oneTapPackaging && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.subtle,
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}>
                    · tap to add
                  </span>
                )}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 8,
              }}>
                {packagingOptions.map((opt) => {
                  const active = chosenPackagingId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setChosenPackagingId(opt.id);
                        if (oneTapPackaging) onAdd(chosenVariant, opt.id);
                      }}
                      style={{
                        padding: '14px 14px',
                        borderRadius: 10,
                        border: `2px solid ${active ? C.text : C.border2}`,
                        background: active ? C.text : '#FFFFFF',
                        color: active ? '#FFFFFF' : C.text,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        minHeight: 64,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
                        {opt.name}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        opacity: active ? 0.95 : 0.85,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {Number(opt.fee) > 0 ? `+MVR ${Number(opt.fee).toFixed(2)}` : 'No fee'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Defensive fallback — shouldn't fire in practice because the
              tile-tap handler only opens this modal when there are
              modifiers, variants, or packaging choices. */}
          {!item.has_variants && mods.length === 0 && !showPackagingPicker && (
            <div style={{ fontSize: 13, color: C.muted }}>
              Nothing to configure — tap "Add to ticket" to drop it on the order.
            </div>
          )}
        </div>

        <div style={{
          padding: 16,
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}>
          {/* In one-tap variant mode (no modifiers) tapping a size IS
              the add — a second "Add to ticket" button next to it
              was confusing cashiers ("why is this here?") and risked
              double-adding if they tapped it after a variant. We
              collapse the footer to a full-width Cancel so the only
              way to commit is the variant tap, which makes the flow
              unambiguous. */}
          {oneTapMode ? (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 10,
                background: '#FFFFFF', border: `1px solid ${C.border2}`,
                fontSize: 14, fontWeight: 700, color: C.muted, cursor: 'pointer',
                minHeight: 48,
              }}
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10,
                  background: '#FFFFFF', border: `1px solid ${C.border2}`,
                  fontSize: 14, fontWeight: 700, color: C.muted, cursor: 'pointer',
                  minHeight: 48,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => onAdd(chosenVariant, chosenPackagingId)}
                disabled={!canAdd}
                title={needsVariant ? 'Pick a size/option to continue' : undefined}
                style={{
                  flex: 2, padding: '12px 16px', borderRadius: 10,
                  background: canAdd ? '#10B981' : '#A7F3D0',
                  border: 'none',
                  fontSize: 14, fontWeight: 700, color: '#FFFFFF',
                  cursor: canAdd ? 'pointer' : 'not-allowed',
                  minHeight: 48,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>Add to ticket</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  MVR {headlinePrice.toFixed(2)}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 10,
};
