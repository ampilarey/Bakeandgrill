import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchCategories,
  fetchItems,
  fetchOnlineOrderingStatus,
  fetchOrderingEligibility,
  fetchOffers,
  getMyFavourites,
  toggleFavourite,
  getWaitTimeEstimate,
  API_ORIGIN,
} from '../api';
import type { Category, Item, Modifier, Offer } from '../api';
import type { Variant } from '@shared/types';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from '../components/menu/ProductCard';
import { ItemSheet } from '../components/ItemSheet';
import { SearchOverlay } from '../components/SearchOverlay';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useShellNav } from '../context/ShellNavContext';
import { useToast } from '../context/ToastContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { OrderDayToggle } from '../components/OrderDayToggle';
import { DaySwitchConfirmSheet } from '../components/DaySwitchConfirmSheet';
import { useOrderDay, type OrderDay } from '../context/OrderDayContext';
import { isItemAvailableNow } from '../utils/itemAvailability';
import { useOrderMode } from '../context/OrderModeContext';
import { useServiceStatusContext } from '../context/ServiceStatusContext';
import { isDeliveryBlocked, isPickupBlocked } from '../utils/fulfilmentAvailability';
import { CategoryRail } from '../components/menu/CategoryRail';
import { MenuSectionHeader } from '../components/menu/MenuSectionHeader';
import { FilterChipsRow, type SaleFilter } from '../components/menu/FilterChipsRow';
import { MenuQuickFilters } from '../components/menu/MenuQuickFilters';
import { OffersRail } from '../components/home/OffersRail';
import { pickActiveSectionId } from '../utils/scrollSpy';
import { categoryScrollTop } from '../utils/menuScroll';
import {
  categoryLooksLikeCatering,
  isMenuCateringItem,
  mergeCateringSectionItems,
} from '../utils/menuCatering';
import { formatTomorrowDateLabel } from '../utils/collectOn';
import { consumePendingPlatterReorder } from '../utils/applyReorderToCart';
import { itemSortPrice } from '../utils/money';
const MENU_VIEW_KEY = 'bg-menu-view';
type MenuViewMode = 'grid' | 'list';

function readMenuView(): MenuViewMode {
  try {
    const v = localStorage.getItem(MENU_VIEW_KEY);
    return v === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Which edge the category rail sits on. Same key as the website menu. */
type RailSide = 'left' | 'right';
const RAIL_SIDE_KEY = 'bg-menu-rail-side';
function readRailSide(): RailSide {
  try {
    return localStorage.getItem(RAIL_SIDE_KEY) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

function isItemOnSale(item: Item): boolean {
  if (item.special?.effective_price != null) return true;
  return (item.variants ?? []).some(
    (v) => v.is_active && v.effective_price != null && Number(v.effective_price) < Number(v.price),
  );
}

function isPercentDiscountItem(item: Item): boolean {
  return item.special?.discount_pct != null && item.special.discount_pct > 0;
}

function isFixedSpecialItem(item: Item): boolean {
  return isItemOnSale(item) && !isPercentDiscountItem(item);
}

function slugifyCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function salesCount(item: Item): number {
  return Number(item.sales_30d ?? 0);
}

function isBestsellerItem(item: Item): boolean {
  return salesCount(item) > 0;
}

function itemAvailableRank(item: Item): number {
  if (typeof item.available_now === 'boolean') return item.available_now ? 0 : 1;
  return item.is_available === false ? 1 : 0;
}

function sortMenuItems(list: Item[], sortBy: string): Item[] {
  const byAvailThen = (primary: (a: Item, b: Item) => number) =>
    [...list].sort((a, b) => itemAvailableRank(a) - itemAvailableRank(b) || primary(a, b));

  // By the cheapest size, not base_price: a sized item carries base_price 0,
  // so "cheapest first" used to put every drink and platter above a 5.00 bun.
  if (sortBy === 'price-low') return byAvailThen((a, b) => itemSortPrice(a) - itemSortPrice(b));
  if (sortBy === 'price-high') return byAvailThen((a, b) => itemSortPrice(b) - itemSortPrice(a));
  if (sortBy === 'bestseller') {
    return byAvailThen((a, b) => salesCount(b) - salesCount(a) || a.name.localeCompare(b.name));
  }
  return byAvailThen((a, b) => a.name.localeCompare(b.name));
}

const DIETARY_FILTERS = [
  { id: 'vegetarian', label: '🥬 Vegetarian' },
  { id: 'vegan', label: '🌱 Vegan' },
  { id: 'halal', label: '☪ Halal' },
  { id: 'gluten-free', label: '🌾 Gluten-free' },
  { id: 'spicy', label: '🌶 Spicy' },
] as const;

/** Normalize free-form admin tags so "Gluten Free" / "gluten_free" match "gluten-free". */
function normalizeDietaryTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function dietaryFilterLabel(slug: string, sampleRaw?: string): string {
  const known = DIETARY_FILTERS.find((f) => f.id === slug);
  if (known) return known.label;
  const raw = (sampleRaw?.trim() || slug.replace(/-/g, ' ')).replace(/\s+/g, ' ');
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MenuPage() {
  const { addItem, pruneCartToAllowedItemIds, refreshPricesFromMenu, cart } = useCart();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
  const { openCartSheet } = useShellNav();
  const { isAvailable: isServiceAvailable, get: getServiceEntry } = useServiceStatusContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  /** Dedicated catering-channel listing (may include items not on pickup/delivery). */
  const [cateringListing, setCateringListing] = useState<Item[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersHeadline, setOffersHeadline] = useState<string | null>(null);
  const [offersSubtext, setOffersSubtext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());
  const [waitMinutes, setWaitMinutes] = useState<number | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeSubcategoryId, setActiveSubcategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [saleFilter, setSaleFilter] = useState<SaleFilter>('all');
  const [dietaryFilter, setDietaryFilter] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);

  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean>(true);
  const [dineInPreorderEnabled, setDineInPreorderEnabled] = useState<boolean>(false);
  /** Owner kill switch / schedule for collect-tomorrow (older servers omit = on). */
  const [tomorrowGateOpen, setTomorrowGateOpen] = useState<boolean>(true);
  /** Per-mode gates from status (null = older payload — fail open). */
  const [modeGates, setModeGates] = useState<{
    pickup: boolean | null;
    delivery: boolean | null;
    dine_in: boolean | null;
  }>({ pickup: null, delivery: null, dine_in: null });
  const [tomorrowModeGates, setTomorrowModeGates] = useState<{
    pickup: boolean | null;
    delivery: boolean | null;
    dine_in: boolean | null;
  }>({ pickup: null, delivery: null, dine_in: null });
  /** null = not loaded / failed — must not block delivery. */
  const [eligibilityAccepting, setEligibilityAccepting] = useState<boolean | null>(null);
  const [gateMessage, setGateMessage] = useState<string>('');
  const [collectTomorrowDate, setCollectTomorrowDate] = useState<string | null>(null);

  const { day, setDay } = useOrderDay();
  const { mode, modeConfirmed, setMode } = useOrderMode();
  /** Pending manual day switch that would remove cart lines — asks first. */
  const [daySwitchConfirm, setDaySwitchConfirm] = useState<{ target: OrderDay; count: number } | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [viewMode, setViewMode] = useState<MenuViewMode>(() => readMenuView());

  const setMenuView = (mode: MenuViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(MENU_VIEW_KEY, mode);
    } catch { /* ignore */ }
  };

  // Owner, 2026-09-03: "a button near grid/list to change from right to
  // left". The rail sits under the left thumb by default; a right-handed
  // customer can move it to the other edge. Remembered per device.
  const [railSide, setRailSide] = useState<RailSide>(() => readRailSide());
  // Owner, 2026-09-03: "keep A–Z, price, up/down, grid, list etc. hidden …
  // this to keep more space for menu items." Sort, dietary chips, view
  // toggle and quick filters are set once and then sit in the way of the
  // food, so they fold behind the one button in the top row. Remembered per
  // device, so anyone who works with them open keeps them open.
  const CONTROLS_KEY = 'bg-menu-controls-open';
  const [controlsOpen, setControlsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CONTROLS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleControls = () => {
    setControlsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(CONTROLS_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  };

  // The floating cart button and back-to-top live in the shell, not here, so
  // the rail side is published on <html> for them to read (owner, 2026-09-03:
  // on a phone the cart button would otherwise sit over a right-hand rail).
  // Cleared on leaving the menu, where there is no rail to clash with.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('rail-right', railSide === 'right');
    return () => root.classList.remove('rail-right');
  }, [railSide]);

  const toggleRailSide = () => {
    const next: RailSide = railSide === 'right' ? 'left' : 'right';
    setRailSide(next);
    try {
      localStorage.setItem(RAIL_SIDE_KEY, next);
    } catch { /* ignore */ }
  };

  const cartRef = useRef(cart);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const sectionVisibilityRef = useRef<Map<number, { id: number; ratio: number; top: number }>>(new Map());
  /** Sub-category blocks on their own, so the rail can mark the one in view. */
  const subVisibilityRef = useRef<Map<number, { id: number; parentId: number; ratio: number; top: number }>>(new Map());
  const pendingCategoryScrollRef = useRef<number | null>(null);
  const menuStickyRef = useRef<HTMLDivElement | null>(null);
  const [stickyOffset, setStickyOffset] = useState(112);

  // Back to top visibility — throttled with requestAnimationFrame
  useEffect(() => {
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > 300);
        rafId = null;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const [deliveryFallback, setDeliveryFallback] = useState(false);
  const { text } = useSiteSettingsContext();
  const menuTitle = text('menu_page_title', 'Menu');

  usePageTitle(menuTitle);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const loadMenu = () => {
    setLoading(true);
    Promise.all([
      fetchCategories(),
      fetchItems(),
      fetchItems('catering').catch(() => ({ data: [] as Item[], channelUsed: 'catering' as const, deliveryFallback: false })),
      fetchOnlineOrderingStatus(),
    ])
      .then(([cats, its, cateringIts, gate]) => {
        const loadedItems = its.data ?? [];
        setCategories(cats.data ?? []);
        setItems(loadedItems);
        setCateringListing(cateringIts.data ?? []);
        // Refresh cart item snapshots (allow_pre_order, prices, etc.) so a
        // stale localStorage cart still unlocks "collect tomorrow" when closed.
        refreshPricesFromMenu(loadedItems);
        const allowedIds = new Set(loadedItems.map((item) => item.id));
        const removedCount = cartRef.current.filter((entry) => !allowedIds.has(entry.item.id)).length;
        if (removedCount > 0) {
          pruneCartToAllowedItemIds(allowedIds);
          const pruneKey = removedCount === 1 ? 'menu.toast_prune_one' : 'menu.toast_prune_many';
          showToast(t(pruneKey).replace('{n}', String(removedCount)));
        }
        setDeliveryFallback(its.deliveryFallback);
        if (its.deliveryFallback) {
          showToast(t('menu.toast_delivery_fallback'));
        }
        // Gate API is the single source of truth for ordering status
        setIsOpen(gate.open);
        setDeliveryAvailable(gate.delivery_available ?? true);
        setDineInPreorderEnabled((gate.dine_in_preorder?.open ?? gate.dine_in_preorder?.enabled) === true);
        setTomorrowGateOpen(gate.order_for_tomorrow?.open !== false);
        setModeGates({
          pickup: gate.modes?.pickup?.open ?? null,
          delivery: gate.modes?.delivery?.open ?? null,
          dine_in: gate.modes?.dine_in?.open ?? null,
        });
        setTomorrowModeGates({
          pickup: gate.order_for_tomorrow?.modes?.pickup?.open ?? null,
          delivery: gate.order_for_tomorrow?.modes?.delivery?.open ?? null,
          dine_in: gate.order_for_tomorrow?.modes?.dine_in?.open ?? null,
        });
        setGateMessage(gate.message ?? '');
        setCollectTomorrowDate(gate.order_for_tomorrow?.collect_tomorrow_date ?? null);

        // Re-order of a past platter without saved children → open picker (never empty).
        const pending = consumePendingPlatterReorder();
        if (pending.length > 0) {
          const target = loadedItems.find((i) => i.id === pending[0].item_id);
          if (target?.is_platter) {
            setSelectedItem(target);
            setSelectedQty(pending[0].quantity || 1);
            setSelectedModifiers([]);
            showToast('Choose your platter items');
          }
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMenu();
    fetchOffers()
      .then((res) => {
        setOffers(res.offers ?? []);
        setOffersHeadline(res.headline ?? null);
        setOffersSubtext(res.subtext ?? null);
      })
      .catch(() => { /* non-blocking */ });
    fetchOrderingEligibility()
      .then((elig) => setEligibilityAccepting(elig.delivery.accepting))
      .catch(() => setEligibilityAccepting(null));
    const onChannel = () => loadMenu();
    window.addEventListener('sales_channel_change', onChannel);
    return () => window.removeEventListener('sales_channel_change', onChannel);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    getMyFavourites()
      .then((res) => setFavouriteIds(new Set((res.data ?? []).map((f) => f.id))))
      .catch(() => { /* non-blocking */ });
  }, [isAuthenticated]);

  useEffect(() => {
    getWaitTimeEstimate()
      .then(({ wait_minutes, queue_depth }) => {
        // Only show wait time when there are actual orders in the queue
        if (queue_depth > 0) setWaitMinutes(wait_minutes);
      })
      .catch(() => { /* non-blocking */ });
  }, []);

  const handleToggleFavourite = (itemId: number) => {
    if (!isAuthenticated) { showToast(t('menu.toast_sign_in_favourites')); return; }
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
    toggleFavourite(itemId).catch(() => {
      // Revert on failure
      setFavouriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
      });
    });
  };

  // Re-apply category / item selection whenever the URL search params change
  useEffect(() => {
    if (categories.length === 0) return;
    const categorySlug = searchParams.get('category');
    const itemId = searchParams.get('item') ? Number(searchParams.get('item')) : null;

    if (categorySlug) {
      const normalizedCategorySlug = categorySlug.toLowerCase();
      const match = categories.find(
        (c) => slugifyCategoryName(c.name) === normalizedCategorySlug,
      );
      const sectionCategoryId = match ? (match.parent_id ?? match.id) : null;
      setActiveCategoryId(sectionCategoryId);
      pendingCategoryScrollRef.current = sectionCategoryId;
    } else {
      setActiveCategoryId(null);
      pendingCategoryScrollRef.current = null;
    }

    if (itemId) {
      const match = items.find((i) => i.id === itemId);
      if (match) { setSelectedItem(match); setSelectedModifiers([]); }
    }
  }, [searchParams, categories, items]);

  // Mobile: legacy ?openCart=1 links open the shell cart sheet.
  useEffect(() => {
    if (searchParams.get('openCart') !== '1') return;
    if (window.matchMedia('(max-width: 900px)').matches) openCartSheet();
    const next = new URLSearchParams(searchParams);
    next.delete('openCart');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openCartSheet]);

  const hasTomorrowItems = useMemo(
    () => items.some((item) => Boolean(item.allow_pre_order)) && tomorrowGateOpen,
    [items, tomorrowGateOpen],
  );

  // Closed shop → Tomorrow is the only orderable day; flip automatically.
  // Reverse guard: if Tomorrow has nothing pre-orderable (or the owner switched
  // tomorrow ordering off), fall back to Today.
  useEffect(() => {
    if (loading || isOpen === null) return;
    if (isOpen === false && day === 'today' && hasTomorrowItems) {
      setDay('tomorrow');
    } else if (day === 'tomorrow' && !hasTomorrowItems) {
      setDay('today');
    }
  }, [loading, isOpen, day, hasTomorrowItems, setDay]);

  // Tomorrow carts must be valid by construction — drop lines that can't be pre-ordered.
  // (Safety net for auto-flips and persisted state; manual switches confirm first.)
  useEffect(() => {
    if (day !== 'tomorrow' || items.length === 0) return;
    const allowedIds = new Set(items.filter((i) => Boolean(i.allow_pre_order)).map((i) => i.id));
    const removedCount = cartRef.current.filter((entry) => !allowedIds.has(entry.item.id)).length;
    if (removedCount === 0) return;
    pruneCartToAllowedItemIds(allowedIds);
    const pruneKey = removedCount === 1 ? 'menu.pruned_tomorrow_one' : 'menu.pruned_tomorrow_many';
    showToast(t(pruneKey).replace('{n}', String(removedCount)));
  }, [day, items, pruneCartToAllowedItemIds, showToast, t]);

  // Today carts must only hold items orderable today — a tomorrow cart may
  // legitimately contain items that are sold out / 86'd right now.
  useEffect(() => {
    if (day !== 'today' || isOpen !== true || items.length === 0) return;
    const allowedIds = new Set(items.filter((i) => isItemAvailableNow(i)).map((i) => i.id));
    const removedCount = cartRef.current.filter((entry) => !allowedIds.has(entry.item.id)).length;
    if (removedCount === 0) return;
    pruneCartToAllowedItemIds(allowedIds);
    const pruneKey = removedCount === 1 ? 'menu.pruned_today_one' : 'menu.pruned_today_many';
    showToast(t(pruneKey).replace('{n}', String(removedCount)));
  }, [day, isOpen, items, pruneCartToAllowedItemIds, showToast, t]);

  /** Cart lines the given day cannot carry (drives the switch confirmation). */
  const blockedCartCountForDay = (target: OrderDay): number => {
    if (target === 'tomorrow') {
      return cartRef.current.filter((entry) => !entry.item.allow_pre_order).length;
    }
    return cartRef.current.filter((entry) => !isItemAvailableNow(entry.item)).length;
  };

  const confirmDaySwitch = () => {
    if (!daySwitchConfirm) return;
    const { target } = daySwitchConfirm;
    const allowed = target === 'tomorrow'
      ? items.filter((i) => Boolean(i.allow_pre_order))
      : items.filter((i) => isItemAvailableNow(i));
    pruneCartToAllowedItemIds(new Set(allowed.map((i) => i.id)));
    setDay(target);
    setDaySwitchConfirm(null);
    if (target === 'tomorrow') {
      showToast(t('menu.tomorrow_note').replace('{date}', formatTomorrowDateLabel(collectTomorrowDate)));
    }
  };

  const filteredItems = useMemo(() => {
    let list = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (saleFilter === 'discount') {
      list = list.filter(isPercentDiscountItem);
    } else if (saleFilter === 'special') {
      list = list.filter(isFixedSpecialItem);
    } else if (saleFilter === 'bestseller') {
      list = list.filter(isBestsellerItem);
    }
    if (dietaryFilter) {
      list = list.filter((i) =>
        (i.dietary_tags ?? []).some((t) => normalizeDietaryTag(t) === dietaryFilter),
      );
    }
    const effectiveSort = saleFilter === 'bestseller' ? 'bestseller' : sortBy;
    const sorted = sortMenuItems(list, effectiveSort);
    // Tomorrow mode keeps every item visible (dimmed cards stay viewable) but
    // floats the pre-orderable ones to the top of each section.
    if (day === 'tomorrow') {
      return [
        ...sorted.filter((i) => Boolean(i.allow_pre_order)),
        ...sorted.filter((i) => !i.allow_pre_order),
      ];
    }
    return sorted;
  }, [items, day, searchQuery, sortBy, saleFilter, dietaryFilter]);

  const filtersActive = Boolean(searchQuery.trim() || saleFilter !== 'all' || dietaryFilter != null);

  /** Chips from tags actually on the menu — not only the known whitelist. */
  const availableDietaryFilters = useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const item of items) {
      for (const tag of item.dietary_tags ?? []) {
        const slug = normalizeDietaryTag(tag);
        if (!slug || bySlug.has(slug)) continue;
        bySlug.set(slug, dietaryFilterLabel(slug, tag));
      }
    }
    const knownOrder = DIETARY_FILTERS.map((f) => f.id) as readonly string[];
    return [...bySlug.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => {
        const ai = knownOrder.indexOf(a.id);
        const bi = knownOrder.indexOf(b.id);
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }
        return a.label.localeCompare(b.label);
      });
  }, [items]);

  const discountCount = useMemo(() => items.filter(isPercentDiscountItem).length, [items]);
  const specialCount = useMemo(() => items.filter(isFixedSpecialItem).length, [items]);
  const bestsellerCount = useMemo(() => items.filter(isBestsellerItem).length, [items]);

  // Item counts per category (parent counts include their subcategories).
  // Catering-section items live under Catering, not category tallies.
  const catItemCounts = useMemo(() => {
    const direct: Record<number, number> = {};
    for (const item of items) {
      if (isMenuCateringItem(item, categories)) continue;
      if (item.category_id !== null) direct[item.category_id] = (direct[item.category_id] ?? 0) + 1;
    }
    const total: Record<number, number> = {};
    for (const cat of categories.filter((c) => !c.parent_id)) {
      const subs = categories.filter((c) => c.parent_id === cat.id).map((c) => c.id);
      total[cat.id] = (direct[cat.id] ?? 0) + subs.reduce((s, id) => s + (direct[id] ?? 0), 0);
    }
    for (const cat of categories.filter((c) => c.parent_id)) {
      total[cat.id] = direct[cat.id] ?? 0;
    }
    return total;
  }, [items, categories]);

  const parentCategories = useMemo(
    () => categories
      .filter((cat) => !cat.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  );

  const railCategories = useMemo(
    () => parentCategories.filter((cat) => (catItemCounts[cat.id] ?? 0) > 0),
    [parentCategories, catItemCounts],
  );

  const sectionedMenu = useMemo(() => {
    const usedItemIds = new Set<number>();
    // An item sits under its home category and under every "also show in"
    // category (owner, 2026-09-03: Bajiya under Kulhi Hedhikaa and Evening
    // Tea). Same card in each place.
    const inCategory = (item: Item, categoryId: number) =>
      item.category_id === categoryId || (item.extra_category_ids ?? []).includes(categoryId);
    const sections = parentCategories
      .map((category) => {
        const childCats = categories
          .filter((c) => c.parent_id === category.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

        const directItems = sortMenuItems(
          items.filter(
            (item) => inCategory(item, category.id) && !isMenuCateringItem(item, categories),
          ),
          sortBy,
        );
        const subcategories = childCats
          .map((sub) => ({
            category: sub,
            items: sortMenuItems(
              items.filter(
                (item) => inCategory(item, sub.id) && !isMenuCateringItem(item, categories),
              ),
              sortBy,
            ),
          }))
          .filter((block) => block.items.length > 0);

        for (const item of directItems) usedItemIds.add(item.id);
        for (const block of subcategories) {
          for (const item of block.items) usedItemIds.add(item.id);
        }

        return { category, directItems, subcategories };
      })
      .filter((section) => {
        // Hide a bare "Catering"/"Events" parent once its items move to the catering section.
        if (categoryLooksLikeCatering(section.category.name)) return false;
        return section.directItems.length > 0 || section.subcategories.length > 0;
      });

    const catering = sortMenuItems(
      mergeCateringSectionItems(
        items,
        cateringListing,
        (item) => isMenuCateringItem(item, categories),
      ),
      sortBy,
    );
    for (const item of catering) usedItemIds.add(item.id);
    const other = sortMenuItems(items.filter((item) => !usedItemIds.has(item.id)), sortBy);
    return { sections, other, catering };
  }, [categories, parentCategories, items, cateringListing, sortBy]);

  const hasSectionedItems =
    sectionedMenu.sections.length > 0
    || sectionedMenu.other.length > 0
    || sectionedMenu.catering.length > 0;
  const [cateringOpen, setCateringOpen] = useState(true);
  const [cateringRailActive, setCateringRailActive] = useState(false);

  // Keep --menu-sticky-offset in sync with the real sticky controls height
  // (pickup/search/filters/grid). Fixed 112px was undershooting/overshooting.
  useEffect(() => {
    const el = menuStickyRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (!Number.isFinite(h) || h <= 0) return;
      setStickyOffset(h);
      document.documentElement.style.setProperty('--menu-sticky-offset', `${h}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--menu-sticky-offset');
    };
  }, [loading, deliveryFallback, waitMinutes, filtersActive]);

  // Only sub-categories that actually have items on this menu — the sections
  // already drop empty ones, and a rail entry with nothing to scroll to is a
  // dead tap.
  const railSubcategories = useMemo(
    () => Object.fromEntries(
      sectionedMenu.sections
        .filter((section) => section.subcategories.length > 0)
        .map((section) => [section.category.id, section.subcategories.map((block) => block.category)]),
    ),
    [sectionedMenu.sections],
  );

  const scrollToCategorySection = (categoryId: number, behavior: ScrollBehavior = 'smooth') => {
    const section = document.getElementById(`menu-section-${categoryId}`);
    if (!section) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stickyH = menuStickyRef.current?.getBoundingClientRect().height ?? stickyOffset;
    const top = categoryScrollTop(
      section.getBoundingClientRect().top,
      window.scrollY,
      stickyH,
      4,
    );
    window.scrollTo({ top, behavior: reduced ? 'auto' : behavior });
  };

  const scrollToCateringSection = (behavior: ScrollBehavior = 'smooth') => {
    const section = document.getElementById('menu-section-catering');
    if (!section) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stickyH = menuStickyRef.current?.getBoundingClientRect().height ?? stickyOffset;
    const top = categoryScrollTop(
      section.getBoundingClientRect().top,
      window.scrollY,
      stickyH,
      4,
    );
    window.scrollTo({ top, behavior: reduced ? 'auto' : behavior });
  };

  const handleSelectCatering = () => {
    // Left-rail Events shortcut: jump to the on-menu catering block, or open the event wizard.
    if (sectionedMenu.catering.length === 0) {
      void navigate('/events');
      return;
    }
    setCateringOpen(true);
    setCateringRailActive(true);
    setActiveCategoryId(null);
    isProgrammaticScroll.current = true;
    // Wait a tick so the section is expanded before measuring scroll.
    requestAnimationFrame(() => {
      scrollToCateringSection();
    });
    if (programmaticScrollTimerRef.current !== null) window.clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
      programmaticScrollTimerRef.current = null;
    }, 800);
  };

  const handleSelectCategory = (categoryId: number) => {
    setCateringRailActive(false);
    setActiveCategoryId(categoryId);
    setActiveSubcategoryId(null);
    isProgrammaticScroll.current = true;
    scrollToCategorySection(categoryId);
    if (programmaticScrollTimerRef.current !== null) window.clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
      programmaticScrollTimerRef.current = null;
    }, 500);
  };

  // A sub-category block carries the same `menu-section-{id}` id as a
  // section, so the one scroll helper reaches both.
  const handleSelectSubcategory = (subcategoryId: number, parentId: number) => {
    setCateringRailActive(false);
    setActiveCategoryId(parentId);
    setActiveSubcategoryId(subcategoryId);
    isProgrammaticScroll.current = true;
    scrollToCategorySection(subcategoryId);
    if (programmaticScrollTimerRef.current !== null) window.clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
      programmaticScrollTimerRef.current = null;
    }, 500);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSaleFilter('all');
    setDietaryFilter(null);
  };

  useEffect(() => {
    if (filtersActive || loading || sectionedMenu.sections.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const headers = Array.from(document.querySelectorAll<HTMLElement>(
      '.menu-section-header[data-category-id], .menu-subcategory[data-category-id]',
    ));
    if (headers.length === 0) return;

    sectionVisibilityRef.current = new Map();
    subVisibilityRef.current = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        // Subcategory spy maps to parent rail id (parent_id ?? id)
        const id = Number(el.dataset.parentCategoryId || el.dataset.categoryId);
        if (!Number.isFinite(id)) continue;
        sectionVisibilityRef.current.set(id, {
          id,
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        });
        if (el.dataset.parentCategoryId) {
          const subId = Number(el.dataset.categoryId);
          if (Number.isFinite(subId)) {
            subVisibilityRef.current.set(subId, {
              id: subId,
              parentId: id,
              ratio: entry.intersectionRatio,
              top: entry.boundingClientRect.top,
            });
          }
        }
      }

      if (isProgrammaticScroll.current) return;
      const next = pickActiveSectionId(Array.from(sectionVisibilityRef.current.values()), activeCategoryId);
      if (next !== activeCategoryId) {
        setCateringRailActive(false);
        setActiveCategoryId(next);
      }
      // The sub-category in view, if any, under the section now active. The
      // most-visible one wins; nothing in view means the rail marks only the
      // parent — the category's own items have no sub-entry to light up.
      const subs = Array.from(subVisibilityRef.current.values())
        .filter((s) => s.parentId === next && s.ratio > 0)
        .sort((a, b) => b.ratio - a.ratio || Math.abs(a.top) - Math.abs(b.top));
      setActiveSubcategoryId(subs.length > 0 ? subs[0].id : null);
    }, {
      rootMargin: `-${Math.max(stickyOffset, 1)}px 0px -55% 0px`,
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
    });

    headers.forEach((header) => observer.observe(header));
    return () => observer.disconnect();
  }, [activeCategoryId, filtersActive, loading, sectionedMenu.sections, stickyOffset]);

  useEffect(() => {
    if (filtersActive || loading || pendingCategoryScrollRef.current == null) return;
    const categoryId = pendingCategoryScrollRef.current;
    pendingCategoryScrollRef.current = null;
    window.setTimeout(() => {
      requestAnimationFrame(() => scrollToCategorySection(categoryId, 'auto'));
    }, 0);
  }, [filtersActive, loading, sectionedMenu.sections]);

  useEffect(() => () => {
    if (programmaticScrollTimerRef.current !== null) window.clearTimeout(programmaticScrollTimerRef.current);
  }, []);

  const handleSelectItem = (item: Item, qty = 1) => { setSelectedItem(item); setSelectedQty(qty); setSelectedModifiers([]); };
  const toggleModifier = (mod: Modifier) => {
    setSelectedModifiers((prev) => {
      const exists = prev.some((m) => m.id === mod.id);
      return exists ? prev.filter((m) => m.id !== mod.id) : [...prev, mod];
    });
  };
  const handleModalAdd = (
    variant?: Variant | null,
    packagingOptionId?: number | null,
    platterSelections?: import('@shared/types').PlatterSelection[],
  ) => {
    if (!selectedItem) return;
    addItem(
      selectedItem,
      selectedQty,
      selectedModifiers,
      variant ?? null,
      packagingOptionId,
      { platterSelections: platterSelections ?? [] },
    );
    const label = variant ? `${selectedItem.name} (${variant.name})` : selectedItem.name;
    showToast(`${label} added to cart`);
    setSelectedItem(null);
    setSelectedQty(1);
    setSelectedModifiers([]);
  };

  const renderProductCard = (item: Item) => (
    <div key={item.id} className="menu-item-anim">
      <ProductCard
        item={item}
        layout={viewMode}
        orderDay={day}
        onSelectItem={(it, qty) => handleSelectItem(it, qty)}
        onAddToCart={(it, qty, variant, packagingOptionId) => {
          addItem(it, qty, [], variant ?? null, packagingOptionId);
          showToast(variant ? `${it.name} (${variant.name}) added` : `${it.name} added to cart`);
        }}
        isFavourite={favouriteIds.has(item.id)}
        onToggleFavourite={handleToggleFavourite}
      />
    </div>
  );

  const forTomorrow = day === 'tomorrow';
  const pickupBlocked = isPickupBlocked({
    serviceAvailable: isServiceAvailable('online_pickup'),
    modeGateOpen: forTomorrow ? tomorrowModeGates.pickup : modeGates.pickup,
  });
  const deliveryBlocked = isDeliveryBlocked({
    isOpen,
    deliveryAvailable,
    eligibilityAccepting,
    serviceAvailable: isServiceAvailable('online_delivery'),
    forTomorrow,
    modeGateOpen: forTomorrow ? tomorrowModeGates.delivery : modeGates.delivery,
  });
  const dineInAvailableToday = modeGates.dine_in ?? (dineInPreorderEnabled && isOpen === true);
  const dineInAvailable = forTomorrow
    ? tomorrowModeGates.dine_in === true
    : dineInAvailableToday;

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }} className="animate-fade-in">
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.4 }}>⚠️</div>
          <p style={{ marginBottom: '1.25rem', color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
            Couldn't load the menu. Check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.65rem 1.5rem',
              background: 'var(--color-primary)',
              color: 'white', border: 'none',
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 600, fontSize: '0.9375rem',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto', padding: '0 var(--page-gutter) 5rem', position: 'relative' }}>
      {/* ── Sticky menu controls ─────────────────────────────────── */}
      <div
        ref={menuStickyRef}
        className="menu-sticky-controls"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          padding: '0.75rem 0',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="menu-top-row">
          <div className="menu-top-row__day">
            <OrderDayToggle
              tomorrowDate={collectTomorrowDate}
              todayBlocked={isOpen === false}
              tomorrowBlocked={!loading && !hasTomorrowItems}
              beforeDaySelect={(next) => {
                const count = blockedCartCountForDay(next);
                if (count === 0) return true;
                setDaySwitchConfirm({ target: next, count });
                return false;
              }}
              onDaySelect={(next) => {
                if (next === 'tomorrow') {
                  showToast(t('menu.tomorrow_note').replace('{date}', formatTomorrowDateLabel(collectTomorrowDate)));
                }
              }}
              onBlockedTap={(blockedDay) => {
                showToast(
                  blockedDay === 'today'
                    ? (gateMessage || t('day.today_closed'))
                    : t('day.tomorrow_unavailable'),
                );
              }}
            />
          </div>
          <div
            data-testid="mode-chip"
            role="group"
            aria-label={t('mode.toggle_aria')}
            className={`mode-switch${!modeConfirmed ? ' mode-switch--unset' : ''}`}
          >
            {([
              {
                id: 'pickup' as const,
                label: t('mode.pickup'),
                blocked: pickupBlocked,
                blockedReason: t('modeSheet.pickup_unavailable'),
              },
              {
                id: 'delivery' as const,
                label: t('mode.delivery'),
                blocked: deliveryBlocked,
                blockedReason: getServiceEntry('online_delivery')?.public_message?.trim() || gateMessage || t('modeSheet.delivery_unavailable'),
              },
              {
                id: 'dine_in' as const,
                label: t('mode.eat_here'),
                blocked: !dineInAvailable,
                blockedReason: day === 'tomorrow' ? t('modeSheet.eat_here_tomorrow') : t('modeSheet.eat_here_unavailable'),
              },
            ]).map((opt) => {
              const active = modeConfirmed ? mode === opt.id : opt.id === 'pickup';
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`mode-switch-${opt.id}`}
                  // Owner, 2026-09-03: a tap switches straight away; the
                  // "How do you want your order?" sheet was one tap too many.
                  // A dimmed option explains itself in a short toast instead.
                  onClick={() => {
                    if (opt.blocked) { showToast(opt.blockedReason, 'info'); return; }
                    setMode(opt.id);
                  }}
                  aria-pressed={active}
                  aria-disabled={opt.blocked || undefined}
                  data-blocked={opt.blocked ? 'true' : undefined}
                  className={`mode-switch__btn${active ? ' is-active' : ''}${opt.blocked ? ' is-blocked' : ''}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {/* One button for search, sort and layout — everything that used to
              take two rows above the food (owner, 2026-09-03). */}
          <button
            type="button"
            data-testid="menu-controls-toggle"
            onClick={toggleControls}
            aria-expanded={controlsOpen}
            aria-controls="menu-controls"
            style={{
              minWidth: 44,
              minHeight: 44,
              padding: '0 0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              background: searchQuery.trim() || filtersActive ? 'var(--color-primary-light)' : 'var(--color-surface)',
              color: searchQuery.trim() || filtersActive ? 'var(--color-primary)' : 'var(--color-text)',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('menu.controls_toggle')}
            {searchQuery.trim()
              ? ` · "${searchQuery.trim()}"`
              : filtersActive ? ` · ${t('menu.controls_on')}` : ''}
            <span aria-hidden="true" style={{ fontSize: '0.7rem', opacity: 0.7 }}>
              {controlsOpen ? '▾' : '▸'}
            </span>
          </button>
          {/* Wait time is status, not a control, so it stays in view. */}
          {waitMinutes !== null && (
            <div
              role="status"
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: 999,
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                border: '1px solid var(--color-border)',
                fontSize: '0.8rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              ~{waitMinutes} min wait
            </div>
          )}
        </div>

        {controlsOpen && (
        <div id="menu-controls" data-testid="menu-controls">
        <button
          type="button"
          data-testid="menu-open-search"
          onClick={() => setSearchOpen(true)}
          aria-label={t('menu.search_aria')}
          style={{
            width: '100%',
            minHeight: 44,
            margin: '0.5rem 0 0.25rem',
            padding: '0 0.9rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            border: '1.5px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-surface)',
            color: searchQuery.trim() ? 'var(--color-text)' : 'var(--color-text-muted)',
            fontFamily: 'inherit',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span aria-hidden="true">🔍</span>
          {searchQuery.trim() ? `"${searchQuery.trim()}"` : t('menu.open_search')}
        </button>

        <FilterChipsRow
          sortBy={sortBy}
          onSortChange={setSortBy}
          dietaryFilter={dietaryFilter}
          onDietaryFilterChange={setDietaryFilter}
          dietaryOptions={[...availableDietaryFilters]}
          filtersActive={filtersActive}
          onClear={handleClearFilters}
        />

        <div className="menu-view-row">
          <div className="menu-view-toggle" role="group" aria-label="Menu layout">
            <button
              type="button"
              className={`menu-view-toggle__btn${viewMode === 'grid' ? ' is-active' : ''}`}
              aria-pressed={viewMode === 'grid'}
              onClick={() => setMenuView('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={`menu-view-toggle__btn${viewMode === 'list' ? ' is-active' : ''}`}
              aria-pressed={viewMode === 'list'}
              onClick={() => setMenuView('list')}
            >
              List
            </button>
          </div>
          <button
            type="button"
            className="menu-rail-side-btn"
            data-testid="menu-rail-side"
            aria-pressed={railSide === 'right'}
            aria-label={railSide === 'right' ? t('menu.rail_side_left') : t('menu.rail_side_right')}
            title={t('menu.rail_side_title')}
            onClick={toggleRailSide}
          >
            <span className="menu-rail-side-btn__icon" aria-hidden="true">⇆</span>
          </button>
          <MenuQuickFilters
            saleFilter={saleFilter}
            onChange={setSaleFilter}
            discountCount={discountCount}
            specialCount={specialCount}
            bestsellerCount={bestsellerCount}
          />
        </div>
        </div>
        )}

        {deliveryFallback && (
          <div
            role="status"
            style={{
              marginTop: '0.75rem',
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--color-primary-light, #FFF7ED)',
              border: '1px solid var(--color-primary, #D4813A)',
              fontSize: '0.875rem',
              color: 'var(--color-text)',
            }}
          >
            {t('menu.delivery_fallback_banner')}
          </div>
        )}
      </div>

      <div
        className={`menu-columns${railSide === 'right' ? ' menu-columns--rail-right' : ''}`}
        data-testid="menu-columns"
        style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', position: 'relative' }}
      >
        <CategoryRail
          categories={railCategories}
          activeCategoryId={activeCategoryId}
          onSelect={handleSelectCategory}
          dimmed={loading || filtersActive}
          counts={catItemCounts}
          subcategories={railSubcategories}
          activeSubcategoryId={activeSubcategoryId}
          onSelectSubcategory={handleSelectSubcategory}
          showOffersPill={offers.length > 0}
          onOffersClick={() => document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          showCateringPill
          cateringActive={cateringRailActive}
          cateringCount={sectionedMenu.catering.length}
          onCateringClick={handleSelectCatering}
        />

        {/* ── Main menu column ───────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            paddingTop: 0,
          }}
        >
          {/* Unified Offers rail (specials + auto-promos) */}
          <OffersRail
            offers={offers}
            headline={offersHeadline}
            subtext={offersSubtext}
            apiOrigin={API_ORIGIN}
          />

          {loading && (
            <div className={viewMode === 'list' ? 'menu-list' : 'menu-grid'} style={{ padding: '0 0 1.25rem' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ borderRadius: '16px', height: viewMode === 'list' ? '140px' : '300px' }} />
              ))}
            </div>
          )}

          {!loading && (filtersActive ? filteredItems.length === 0 : !hasSectionedItems) && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <p className="empty-state-title">
                {searchQuery.trim()
                  ? t('menu.no_results').replace('{q}', searchQuery.trim())
                  : 'Nothing here yet'}
              </p>
              <p className="empty-state-sub">
                {filtersActive ? 'Try clearing filters or using a different search term.' : 'Check back soon.'}
              </p>
              {filtersActive && (
                <button
                  onClick={handleClearFilters}
                  style={{ marginTop: '1rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' }}
                >
                  {t('menu.clear_filters')}
                </button>
              )}
            </div>
          )}

          {!loading && filtersActive && filteredItems.length > 0 && (
            <div className={viewMode === 'list' ? 'menu-list' : 'menu-grid'} style={{ paddingBottom: '1.25rem' }}>
              {filteredItems.map(renderProductCard)}
            </div>
          )}

          {!loading && !filtersActive && hasSectionedItems && (
            <div>
              {sectionedMenu.sections.map((section, sectionIndex) => (
                <section
                  key={section.category.id}
                  id={`menu-section-${section.category.id}`}
                  data-category-id={section.category.id}
                  className={sectionIndex === 0 ? 'menu-section menu-section--first' : 'menu-section'}
                  style={{
                    scrollMarginTop: 'calc(var(--menu-sticky-offset, var(--menu-header-height)) + 4px)',
                  }}
                >
                  <MenuSectionHeader
                    category={section.category}
                    active={activeCategoryId === section.category.id}
                  />
                  {section.directItems.length > 0 && (
                    <div className={viewMode === 'list' ? 'menu-list' : 'menu-grid'} style={{ paddingBottom: '1rem' }}>
                      {section.directItems.map(renderProductCard)}
                    </div>
                  )}
                  {section.subcategories.map((sub) => (
                    <div
                      key={sub.category.id}
                      id={`menu-section-${sub.category.id}`}
                      className="menu-subcategory"
                      data-testid="menu-subcategory"
                      data-category-id={sub.category.id}
                      data-parent-category-id={section.category.id}
                      style={{
                        scrollMarginTop: 'calc(var(--menu-sticky-offset, var(--menu-header-height)) + 4px)',
                        paddingBottom: '0.85rem',
                      }}
                    >
                      <h3 className="menu-subcat-title" data-testid="menu-subcat-title">
                        {sub.category.name}
                      </h3>
                      <div className={viewMode === 'list' ? 'menu-list' : 'menu-grid'}>
                        {sub.items.map(renderProductCard)}
                      </div>
                    </div>
                  ))}
                </section>
              ))}

              {sectionedMenu.other.length > 0 && (
                <section
                  id="menu-section-other"
                  style={{
                    scrollMarginTop: 'calc(var(--menu-sticky-offset, var(--menu-header-height)) + 4px)',
                  }}
                >
                  <header style={{ padding: '1.25rem 0 0.75rem' }}>
                    <h2 className="section-accent" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-dark)' }}>
                      Other
                    </h2>
                  </header>
                  <div className={viewMode === 'list' ? 'menu-list' : 'menu-grid'} style={{ paddingBottom: '1.25rem' }}>
                    {sectionedMenu.other.map(renderProductCard)}
                  </div>
                </section>
              )}

              {sectionedMenu.catering.length > 0 && (
                <section
                  id="menu-section-catering"
                  className="menu-section"
                  style={{
                    scrollMarginTop: 'calc(var(--menu-sticky-offset, var(--menu-header-height)) + 4px)',
                    marginBottom: '0.5rem',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setCateringOpen((o) => !o)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '0.85rem 0', background: 'transparent', border: 'none',
                      borderTop: '1px solid var(--color-border, #E8E0D8)',
                      borderBottom: cateringOpen ? 'none' : '1px solid var(--color-border, #E8E0D8)',
                      cursor: 'pointer', textAlign: 'left', minHeight: 44,
                    }}
                  >
                    <div>
                      <h2 className="section-accent" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-dark)' }}>
                        Event & catering menu
                      </h2>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-muted, #6B5D4F)' }}>
                        {sectionedMenu.catering.length} item{sectionedMenu.catering.length === 1 ? '' : 's'} · order for today like any other menu item
                      </p>
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--color-muted, #6B5D4F)', flexShrink: 0 }} aria-hidden>
                      {cateringOpen ? '▾' : '▸'}
                    </span>
                  </button>
                  {cateringOpen && (
                    <div className={viewMode === 'list' ? 'menu-list' : 'menu-grid'} style={{ paddingBottom: '1.25rem' }}>
                      {sectionedMenu.catering.map(renderProductCard)}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        items={items}
        orderDay={day}
        categories={categories}
        onSelectItem={(it, qty) => handleSelectItem(it, qty)}
        onAddToCart={(it, qty, variant, packagingOptionId) => {
          addItem(it, qty, [], variant ?? null, packagingOptionId);
          showToast(variant ? `${it.name} (${variant.name}) added` : `${it.name} added to cart`);
        }}
        onSelectCategory={(categoryId) => {
          setSearchQuery('');
          handleSelectCategory(categoryId);
        }}
        favouriteIds={favouriteIds}
        onToggleFavourite={handleToggleFavourite}
      />

      {/* ── Back to top FAB ─────────────────────────────────────── */}
      <button
        className={`back-to-top${showBackToTop ? '' : ' hidden'}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
      >
        ↑
      </button>

      {selectedItem && (
        <ItemSheet
          open
          item={selectedItem}
          qty={selectedQty}
          orderDay={day}
          selectedModifiers={selectedModifiers}
          onToggleModifier={toggleModifier}
          onAddToCart={handleModalAdd}
          onClose={() => setSelectedItem(null)}
          isFavourite={favouriteIds.has(selectedItem.id)}
          onToggleFavourite={handleToggleFavourite}
        />
      )}

      <DaySwitchConfirmSheet
        open={daySwitchConfirm !== null}
        targetDay={daySwitchConfirm?.target ?? 'today'}
        removeCount={daySwitchConfirm?.count ?? 0}
        onConfirm={confirmDaySwitch}
        onCancel={() => setDaySwitchConfirm(null)}
      />
    </div>
  );
}
