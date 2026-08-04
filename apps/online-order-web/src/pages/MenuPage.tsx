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
import { ServiceBanner } from '../components/ServiceBanner';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useShellNav } from '../context/ShellNavContext';
import { useToast } from '../context/ToastContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { OrderModeToggle } from '../components/OrderModeToggle';
import { useServiceStatusContext } from '../context/ServiceStatusContext';
import { composeClosedMenuBanner } from '../utils/orderingStatusBanner';
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

  if (sortBy === 'price-low') return byAvailThen((a, b) => Number(a.base_price) - Number(b.base_price));
  if (sortBy === 'price-high') return byAvailThen((a, b) => Number(b.base_price) - Number(a.base_price));
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
  const { isAvailable: isServiceAvailable } = useServiceStatusContext();
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [saleFilter, setSaleFilter] = useState<SaleFilter>('all');
  const [dietaryFilter, setDietaryFilter] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);

  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean>(true);
  /** null = not loaded / failed — must not block delivery. */
  const [eligibilityAccepting, setEligibilityAccepting] = useState<boolean | null>(null);
  const [gateMessage, setGateMessage] = useState<string>('');
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [viewMode, setViewMode] = useState<MenuViewMode>(() => readMenuView());

  const setMenuView = (mode: MenuViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(MENU_VIEW_KEY, mode);
    } catch { /* ignore */ }
  };

  const cartRef = useRef(cart);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const sectionVisibilityRef = useRef<Map<number, { id: number; ratio: number; top: number }>>(new Map());
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
        setGateMessage(gate.message ?? '');
        setNextOpenWindow(gate.open ? null : (gate.next_open_window ?? null));
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
    return sortMenuItems(list, effectiveSort);
  }, [items, searchQuery, sortBy, saleFilter, dietaryFilter]);

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
    const sections = parentCategories
      .map((category) => {
        const childCats = categories
          .filter((c) => c.parent_id === category.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

        const directItems = sortMenuItems(
          items.filter(
            (item) => item.category_id === category.id && !isMenuCateringItem(item, categories),
          ),
          sortBy,
        );
        const subcategories = childCats
          .map((sub) => ({
            category: sub,
            items: sortMenuItems(
              items.filter(
                (item) => item.category_id === sub.id && !isMenuCateringItem(item, categories),
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
    isProgrammaticScroll.current = true;
    scrollToCategorySection(categoryId);
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
      }

      if (isProgrammaticScroll.current) return;
      const next = pickActiveSectionId(Array.from(sectionVisibilityRef.current.values()), activeCategoryId);
      if (next !== activeCategoryId) {
        setCateringRailActive(false);
        setActiveCategoryId(next);
      }
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
  const handleModalAdd = (variant?: Variant | null, packagingOptionId?: number | null) => {
    if (!selectedItem) return;
    addItem(selectedItem, selectedQty, selectedModifiers, variant ?? null, packagingOptionId);
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

  const pickupBlocked = isPickupBlocked({ serviceAvailable: isServiceAvailable('online_pickup') });
  const deliveryBlocked = isDeliveryBlocked({
    isOpen,
    deliveryAvailable,
    eligibilityAccepting,
    serviceAvailable: isServiceAvailable('online_delivery'),
  });

  // Shop-level closed notice — drop “check back” filler; keep opens + tomorrow tip.
  // Must stay above any early return so hook order is stable.
  const gateClosedBanner = useMemo(() => {
    if (isOpen !== false) return null;
    let opensFormatted = '';
    if (nextOpenWindow) {
      try {
        const d = new Date(nextOpenWindow);
        if (!Number.isNaN(d.getTime())) {
          opensFormatted = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        }
      } catch { /* ignore */ }
    }
    return composeClosedMenuBanner({
      opensFormatted,
      hasTomorrowItems: items.some((item) => Boolean(item.allow_pre_order)),
      gateMessage,
      fallbackClosed: t('menu.banner_closed_fallback'),
      opensTemplate: t('menu.banner_opens_short'),
      tomorrowLabel: t('menu.banner_tomorrow_short'),
    });
  }, [isOpen, nextOpenWindow, gateMessage, items, t]);

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
      <ServiceBanner gateClosedMessage={gateClosedBanner} />
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
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <OrderModeToggle
              deliveryBlocked={deliveryBlocked}
              pickupBlocked={pickupBlocked}
              onBlockedTap={(mode) => {
                if (mode === 'pickup') {
                  showToast(t('menu.pickup_unavailable') || 'Pickup is currently unavailable');
                } else {
                  showToast(
                    gateMessage
                      || t('menu.delivery_unavailable')
                      || 'Delivery is currently unavailable',
                  );
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t('menu.search_aria')}
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
              background: searchQuery.trim() ? 'var(--color-primary-light)' : 'var(--color-surface)',
              color: searchQuery.trim() ? 'var(--color-primary)' : 'var(--color-text)',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('menu.open_search')}
            {searchQuery.trim() ? ` · "${searchQuery.trim()}"` : ''}
          </button>
        </div>

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
          <MenuQuickFilters
            saleFilter={saleFilter}
            onChange={setSaleFilter}
            discountCount={discountCount}
            specialCount={specialCount}
            bestsellerCount={bestsellerCount}
          />
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

      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', position: 'relative' }}>
        <CategoryRail
          categories={railCategories}
          activeCategoryId={activeCategoryId}
          onSelect={handleSelectCategory}
          dimmed={loading || filtersActive}
          counts={catItemCounts}
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
          selectedModifiers={selectedModifiers}
          onToggleModifier={toggleModifier}
          onAddToCart={handleModalAdd}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
