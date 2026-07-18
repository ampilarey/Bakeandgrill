import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchItems, fetchOnlineOrderingStatus, fetchActiveSpecials, getMyFavourites, toggleFavourite, getWaitTimeEstimate, API_ORIGIN } from '../api';
import type { Category, Item, Modifier, DailySpecial } from '../api';

function fmtOrderingTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const isToday = d.toDateString() === new Date().toDateString();
  const h = d.getHours(), m = d.getMinutes();
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  return isToday ? `today at ${time}` : `${d.toLocaleDateString('en-US', { weekday: 'short' })} at ${time}`;
}
import type { Variant } from '@shared/types';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from '../components/menu/ProductCard';
import { MenuThumb } from '../components/menu/MenuThumb';
import { ItemSheet } from '../components/ItemSheet';
import { CartDrawer } from '../components/CartDrawer';
import { SearchOverlay } from '../components/SearchOverlay';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useShellNav } from '../context/ShellNavContext';
import { useToast } from '../context/ToastContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { OrderModeToggle } from '../components/OrderModeToggle';
import { CategoryRail } from '../components/menu/CategoryRail';
import { MenuSectionHeader } from '../components/menu/MenuSectionHeader';
import { FilterChipsRow, type SaleFilter } from '../components/menu/FilterChipsRow';
import { pickActiveSectionId } from '../utils/scrollSpy';

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

function showDiscountPctUnderBadge(badge: string | null | undefined, discountPct: number | null | undefined): boolean {
  if (!badge || !discountPct || discountPct <= 0) return false;
  return !badge.includes(`${discountPct}%`);
}

function slugifyCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function sortMenuItems(list: Item[], sortBy: string): Item[] {
  if (sortBy === 'price-low') return [...list].sort((a, b) => Number(a.base_price) - Number(b.base_price));
  if (sortBy === 'price-high') return [...list].sort((a, b) => Number(b.base_price) - Number(a.base_price));
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

const DIETARY_FILTERS = [
  { id: 'vegetarian', label: '🥬 Vegetarian' },
  { id: 'vegan', label: '🌱 Vegan' },
  { id: 'halal', label: '☪ Halal' },
  { id: 'gluten-free', label: '🌾 Gluten-free' },
  { id: 'spicy', label: '🌶 Spicy' },
] as const;

export function MenuPage() {
  const { addItem, pruneCartToAllowedItemIds, cart } = useCart();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
  const { openCartSheet } = useShellNav();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [specials, setSpecials] = useState<DailySpecial[]>([]);
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
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [currentClose, setCurrentClose] = useState<string | null>(null);
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean>(true);
  const [nextDeliveryWindow, setNextDeliveryWindow] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const cartRef = useRef(cart);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const sectionVisibilityRef = useRef<Map<number, { id: number; ratio: number; top: number }>>(new Map());
  const pendingCategoryScrollRef = useRef<number | null>(null);

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

  usePageTitle('Menu');

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const loadMenu = () => {
    setLoading(true);
    Promise.all([
      fetchCategories(),
      fetchItems(),
      fetchOnlineOrderingStatus(),
    ])
      .then(([cats, its, gate]) => {
        const loadedItems = its.data ?? [];
        setCategories(cats.data ?? []);
        setItems(loadedItems);
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
        setCurrentClose(gate.current_close ?? null);
        setNextOpenWindow(gate.next_open_window ?? null);
        setDeliveryAvailable(gate.delivery_available ?? true);
        setNextDeliveryWindow(gate.next_delivery_window ?? null);
        const closedMsg = gate.message?.trim();
        setClosedMessage(gate.open ? null : (closedMsg || 'Online ordering is currently closed.'));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMenu();
    fetchActiveSpecials()
      .then(({ specials: sp }) => setSpecials((sp ?? []).slice(0, 8)))
      .catch(() => { /* non-blocking */ });
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
    }
    if (dietaryFilter) {
      list = list.filter((i) => (i.dietary_tags ?? []).some((t) => t.toLowerCase() === dietaryFilter));
    }
    return sortMenuItems(list, sortBy);
  }, [items, searchQuery, sortBy, saleFilter, dietaryFilter]);

  const filtersActive = Boolean(searchQuery.trim() || saleFilter !== 'all' || dietaryFilter != null);

  const availableDietaryFilters = useMemo(() => {
    const tags = new Set<string>();
    for (const item of items) {
      for (const tag of item.dietary_tags ?? []) {
        tags.add(tag.toLowerCase());
      }
    }
    return DIETARY_FILTERS.filter((f) => tags.has(f.id));
  }, [items]);

  const discountCount = useMemo(() => items.filter(isPercentDiscountItem).length, [items]);
  const specialCount = useMemo(() => items.filter(isFixedSpecialItem).length, [items]);

  // Item counts per category (parent counts include their subcategories)
  const catItemCounts = useMemo(() => {
    const direct: Record<number, number> = {};
    for (const item of items) {
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
    const childToParent = new Map<number, number>();
    for (const cat of categories) {
      if (cat.parent_id != null) childToParent.set(cat.id, cat.parent_id);
    }

    const usedItemIds = new Set<number>();
    const sections = parentCategories
      .map((category) => {
        const sectionItems = items.filter((item) => {
          const categoryId = item.category_id;
          if (categoryId == null) return false;
          return categoryId === category.id || childToParent.get(categoryId) === category.id;
        });
        for (const item of sectionItems) usedItemIds.add(item.id);
        return { category, items: sortMenuItems(sectionItems, sortBy) };
      })
      .filter((section) => section.items.length > 0);

    const other = sortMenuItems(items.filter((item) => !usedItemIds.has(item.id)), sortBy);
    return { sections, other };
  }, [categories, parentCategories, items, sortBy]);

  const hasSectionedItems = sectionedMenu.sections.length > 0 || sectionedMenu.other.length > 0;

  const scrollToCategorySection = (categoryId: number, behavior: ScrollBehavior = 'smooth') => {
    const section = document.getElementById(`menu-section-${categoryId}`);
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section?.scrollIntoView({ behavior: reduced ? 'auto' : behavior, block: 'start' });
  };

  const handleSelectCategory = (categoryId: number) => {
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
    const headers = Array.from(document.querySelectorAll<HTMLElement>('.menu-section-header[data-category-id]'));
    if (headers.length === 0) return;

    sectionVisibilityRef.current = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = Number((entry.target as HTMLElement).dataset.categoryId);
        if (!Number.isFinite(id)) continue;
        sectionVisibilityRef.current.set(id, {
          id,
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        });
      }

      if (isProgrammaticScroll.current) return;
      const next = pickActiveSectionId(Array.from(sectionVisibilityRef.current.values()), activeCategoryId);
      if (next !== activeCategoryId) setActiveCategoryId(next);
    }, {
      rootMargin: '-120px 0px -55% 0px',
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
    });

    headers.forEach((header) => observer.observe(header));
    return () => observer.disconnect();
  }, [activeCategoryId, filtersActive, loading, sectionedMenu.sections]);

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
  const handleModalAdd = (variant?: Variant | null) => {
    if (!selectedItem) return;
    addItem(selectedItem, selectedQty, selectedModifiers, variant ?? null);
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
        onSelectItem={(it, qty) => handleSelectItem(it, qty)}
        onAddToCart={(it, qty, variant) => {
          addItem(it, qty, [], variant ?? null);
          showToast(variant ? `${it.name} (${variant.name}) added` : `${it.name} added to cart`);
        }}
        isFavourite={favouriteIds.has(item.id)}
        onToggleFavourite={handleToggleFavourite}
      />
    </div>
  );

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
            <OrderModeToggle deliveryBlocked={isOpen === true && !deliveryAvailable} />
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
          saleFilter={saleFilter}
          onSaleFilterChange={setSaleFilter}
          dietaryFilter={dietaryFilter}
          onDietaryFilterChange={setDietaryFilter}
          dietaryOptions={[...availableDietaryFilters]}
          discountCount={discountCount}
          specialCount={specialCount}
          filtersActive={filtersActive}
          onClear={handleClearFilters}
        />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          {isOpen !== null && (
            <div className={`ordering-status-bar ${isOpen ? (deliveryAvailable ? 'open' : 'pickup-only') : 'closed'}`} style={{ margin: 0 }}>
              <span className="ordering-status-bar-dot" />
              <span className="ordering-status-bar-text">
                {(() => {
                  const closes = fmtOrderingTime(currentClose);
                  const opens = fmtOrderingTime(nextOpenWindow);
                  const deliveryFrom = fmtOrderingTime(nextDeliveryWindow);
                  if (!isOpen) return `Online ordering is closed${opens ? ` · Opens ${opens}` : ''}`;
                  if (!deliveryAvailable) {
                    return `Online ordering is open · Pickup only${deliveryFrom ? ` · Delivery from ${deliveryFrom}` : ''}${closes ? ` · Closes ${closes}` : ''}`;
                  }
                  return `Online ordering is open${closes ? ` · Closes ${closes}` : ''}`;
                })()}
              </span>
            </div>
          )}
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
        />

        {/* ── Main menu column ───────────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0, paddingTop: '1rem' }}>
          {/* Today's Specials */}
          {specials.length > 0 && (
            <section style={{ paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>{t('home.specials_title')}</h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0.15rem 0 0' }}>{t('home.specials_subtitle')}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.875rem', overflowX: 'auto', paddingBottom: '0.35rem' }}>
                {specials.map((sp) => {
                  const cardKey = sp.variant_id ? `${sp.id}-${sp.variant_id}` : String(sp.id);
                  const imgSrc = sp.item_image
                    ? sp.item_image.startsWith('http') ? sp.item_image : `${API_ORIGIN}${sp.item_image.startsWith('/') ? '' : '/'}${sp.item_image}`
                    : null;
                  const price = Number(sp.effective_price ?? 0);
                  const wasPrice = sp.original_price != null && Number(sp.original_price) > price
                    ? Number(sp.original_price)
                    : null;
                  const badge = sp.badge_label ?? (sp.discount_pct ? `${sp.discount_pct}% OFF` : 'Special Offer');
                  const pctUnderBadge = showDiscountPctUnderBadge(sp.badge_label, sp.discount_pct);
                  return (
                    <Link
                      key={cardKey}
                      to={`/menu?item=${sp.item_id}`}
                      style={{
                        flexShrink: 0, width: 168, borderRadius: 'var(--radius-2xl)',
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        overflow: 'hidden', textDecoration: 'none', display: 'flex', flexDirection: 'column',
                      }}
                    >
                      <div style={{ height: 100, position: 'relative', overflow: 'hidden' }}>
                        <MenuThumb src={imgSrc} alt={sp.item_name ?? ''} height={100} />
                        {(badge || sp.discount_pct) && (
                          <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, zIndex: 2 }}>
                            <div style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, lineHeight: 1.3 }}>
                              {badge}
                            </div>
                            {pctUnderBadge && (
                              <div style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, lineHeight: 1.3 }}>
                                {sp.discount_pct}% OFF
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '0.65rem 0.75rem', flex: 1 }}>
                        <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: 12, color: 'var(--color-dark)', lineHeight: 1.3 }}>{sp.item_name}</p>
                        {sp.variant_name && (
                          <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>{sp.variant_name}</p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--color-primary)' }}>MVR {price.toFixed(2)}</span>
                          {wasPrice && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>MVR {wasPrice.toFixed(2)}</span>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {loading && (
            <div className="menu-grid" style={{ padding: '0 0 1.25rem' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ borderRadius: '16px', height: '300px' }} />
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
            <div className="menu-grid" style={{ paddingBottom: '1.25rem' }}>
              {filteredItems.map(renderProductCard)}
            </div>
          )}

          {!loading && !filtersActive && hasSectionedItems && (
            <div>
              {sectionedMenu.sections.map((section) => (
                <section
                  key={section.category.id}
                  id={`menu-section-${section.category.id}`}
                  data-category-id={section.category.id}
                  style={{
                    contentVisibility: 'auto' as any,
                    containIntrinsicSize: '480px',
                    scrollMarginTop: 'calc(var(--menu-header-height) + 8px)',
                  }}
                >
                  <MenuSectionHeader category={section.category} />
                  <div className="menu-grid" style={{ paddingBottom: '1.25rem' }}>
                    {section.items.map(renderProductCard)}
                  </div>
                </section>
              ))}

              {sectionedMenu.other.length > 0 && (
                <section
                  id="menu-section-other"
                  style={{
                    contentVisibility: 'auto' as any,
                    containIntrinsicSize: '360px',
                    scrollMarginTop: 'calc(var(--menu-header-height) + 8px)',
                  }}
                >
                  <header style={{ padding: '1.25rem 0 0.75rem' }}>
                    <h2 className="section-accent" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-dark)' }}>
                      Other
                    </h2>
                  </header>
                  <div className="menu-grid" style={{ paddingBottom: '1.25rem' }}>
                    {sectionedMenu.other.map(renderProductCard)}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>

        {/* ── Desktop cart sidebar ───────────────────────────────── */}
        <aside
          className="cart-sidebar"
          style={{ width: '280px', flexShrink: 0, position: 'sticky', top: 'var(--menu-header-height)', alignSelf: 'flex-start', maxHeight: 'calc(100vh - var(--menu-header-height) - 20px)', overflowY: 'auto', padding: '1rem 0' }}
        >
          <CartDrawer isOpen={isOpen ?? true} closedMessage={closedMessage} />
        </aside>
      </div>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        items={items}
        categories={categories}
        onSelectItem={(it, qty) => handleSelectItem(it, qty)}
        onAddToCart={(it, qty, variant) => {
          addItem(it, qty, [], variant ?? null);
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
