import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchItems, fetchOnlineOrderingStatus, getMyFavourites, toggleFavourite, getWaitTimeEstimate } from '../api';
import type { Category, Item, Modifier } from '../api';

function fmtOrderingTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  const h = d.getHours(), m = d.getMinutes();
  const time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  return isToday ? `today at ${time}` : `${d.toLocaleDateString('en-US', { weekday: 'short' })} at ${time}`;
}
import type { Variant } from '@shared/types';
import { useAuth } from '../context/AuthContext';
import { MenuCard } from '../components/MenuCard';
import { ItemModal } from '../components/ItemModal';
import { CartDrawer } from '../components/CartDrawer';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { usePageTitle } from '../hooks/usePageTitle';

function isItemOnSale(item: Item): boolean {
  if (item.special?.effective_price != null) return true;
  return (item.variants ?? []).some(
    (v) => v.is_active && v.effective_price != null && Number(v.effective_price) < Number(v.price),
  );
}

export function MenuPage() {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favouriteIds, setFavouriteIds] = useState<Set<number>>(new Set());
  const [waitMinutes, setWaitMinutes] = useState<number | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeSubId, setActiveSubId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [onSaleOnly, setOnSaleOnly] = useState(false);

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);

  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [currentClose, setCurrentClose] = useState<string | null>(null);
  const [nextOpenWindow, setNextOpenWindow] = useState<string | null>(null);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean>(true);
  const [nextDeliveryWindow, setNextDeliveryWindow] = useState<string | null>(null);

  const [cartVisible, setCartVisible] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Refs for scrolling category pill into view
  const pillContainerRef = useRef<HTMLDivElement>(null);
  const activePillRef = useRef<HTMLButtonElement>(null);

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

  const loadMenu = () => {
    setLoading(true);
    Promise.all([
      fetchCategories(),
      fetchItems(),
      fetchOnlineOrderingStatus(),
    ])
      .then(([cats, its, gate]) => {
        setCategories(cats.data ?? []);
        setItems(its.data ?? []);
        setDeliveryFallback(its.deliveryFallback);
        if (its.deliveryFallback) {
          showToast('No delivery items right now — showing pickup menu instead.');
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
    const onChannel = () => loadMenu();
    window.addEventListener('sales_channel_change', onChannel);
    return () => window.removeEventListener('sales_channel_change', onChannel);
  }, []);

  useEffect(() => {
    if (!token) return;
    getMyFavourites(token)
      .then((res) => setFavouriteIds(new Set((res.data ?? []).map((f) => f.id))))
      .catch(() => { /* non-blocking */ });
  }, [token]);

  useEffect(() => {
    getWaitTimeEstimate()
      .then(({ wait_minutes, queue_depth }) => {
        // Only show wait time when there are actual orders in the queue
        if (queue_depth > 0) setWaitMinutes(wait_minutes);
      })
      .catch(() => { /* non-blocking */ });
  }, []);

  const handleToggleFavourite = (itemId: number) => {
    if (!token) { showToast('Sign in to save favourites'); return; }
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
    toggleFavourite(token, itemId).catch(() => {
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
      const match = categories.find(
        (c) => c.name.toLowerCase().replace(/\s+/g, '-') === categorySlug,
      );
      setActiveCategoryId(match?.id ?? null);
    } else {
      setActiveCategoryId(null);
    }

    if (itemId) {
      const match = items.find((i) => i.id === itemId);
      if (match) { setSelectedItem(match); setSelectedModifiers([]); }
    }
  }, [searchParams, categories, items]);

  // Mobile: header/bottom-nav "Cart" links use ?openCart=1 — open sheet (they don't tap the FAB).
  useEffect(() => {
    if (searchParams.get('openCart') !== '1') return;
    const sheet = window.matchMedia('(max-width: 900px)').matches;
    if (sheet) setCartVisible(true);
    const next = new URLSearchParams(searchParams);
    next.delete('openCart');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!cartVisible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [cartVisible]);

  // Scroll active pill into view when category changes
  useEffect(() => {
    if (activePillRef.current && pillContainerRef.current) {
      activePillRef.current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [activeCategoryId]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (activeSubId !== null) {
      list = list.filter((i) => i.category_id === activeSubId);
    } else if (activeCategoryId !== null) {
      const subcategoryIds = categories.filter((c) => c.parent_id === activeCategoryId).map((c) => c.id);
      list = subcategoryIds.length > 0
        ? list.filter((i) => i.category_id !== null && (i.category_id === activeCategoryId || subcategoryIds.includes(i.category_id)))
        : list.filter((i) => i.category_id === activeCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (onSaleOnly) {
      list = list.filter(isItemOnSale);
    }
    if (sortBy === 'price-low') return [...list].sort((a, b) => Number(a.base_price) - Number(b.base_price));
    if (sortBy === 'price-high') return [...list].sort((a, b) => Number(b.base_price) - Number(a.base_price));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, categories, activeCategoryId, activeSubId, searchQuery, sortBy, onSaleOnly]);

  const onSaleCount = useMemo(() => items.filter(isItemOnSale).length, [items]);

  // Item counts per category (for bottom sheet badges)
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

  // When a parent category is active (and no sub selected), group items by subcategory
  const itemGroups = useMemo(() => {
    if (activeSubId !== null || activeCategoryId === null || searchQuery.trim()) {
      return [{ label: null as string | null, items: filteredItems }];
    }
    const subs = categories.filter((c) => c.parent_id === activeCategoryId);
    if (subs.length === 0) return [{ label: null as string | null, items: filteredItems }];
    const groups: { label: string | null; items: typeof filteredItems }[] = [];
    const subIds = new Set(subs.map((s) => s.id));
    const direct = filteredItems.filter((i) => i.category_id === null || !subIds.has(i.category_id));
    if (direct.length > 0) groups.push({ label: null, items: direct });
    for (const sub of subs) {
      const subItems = filteredItems.filter((i) => i.category_id === sub.id);
      if (subItems.length > 0) groups.push({ label: sub.name, items: subItems });
    }
    return groups;
  }, [filteredItems, categories, activeCategoryId, activeSubId, searchQuery]);

  const [catSheetOpen, setCatSheetOpen] = useState(false);

  const activeCatLabel = activeCategoryId === null
    ? 'All Items'
    : (categories.find((c) => c.id === activeCategoryId)?.name ?? 'All Items');
  const activeSubLabel = activeSubId !== null
    ? categories.find((c) => c.id === activeSubId)?.name
    : null;
  const sheetSubs = activeCategoryId !== null
    ? categories.filter((c) => c.parent_id === activeCategoryId)
    : [];

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
    <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto', padding: '0 var(--page-gutter) 5rem', display: 'flex', gap: '1.5rem', position: 'relative' }}>

      {/* ── Desktop sidebar categories ─────────────────────────── */}
      <aside style={{ width: '200px', flexShrink: 0, padding: '1.5rem 0' }} className="menu-sidebar">
        <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '0.625rem', padding: '0 0.25rem' }}>
          Categories
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '38px', borderRadius: '10px' }} />
              ))
            : (
              <>
                <CatButton
                  label="All Items"
                  active={activeCategoryId === null}
                  onClick={() => { setActiveCategoryId(null); setActiveSubId(null); }}
                />
                {categories.filter((cat) => !cat.parent_id).map((cat) => (
                  <div key={cat.id}>
                    <CatButton
                      label={cat.name}
                      active={activeCategoryId === cat.id}
                      onClick={() => { setActiveCategoryId(cat.id); setActiveSubId(null); }}
                    />
                    {categories.filter((sub) => sub.parent_id === cat.id).map((sub) => (
                      <div key={sub.id} style={{ paddingLeft: '0.75rem' }}>
                        <CatButton
                          label={'↳ ' + sub.name}
                          active={activeSubId === sub.id}
                          onClick={() => { setActiveCategoryId(cat.id); setActiveSubId(sub.id); }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )
          }
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Online ordering status bar */}
        {isOpen !== null && (
          <div className={`ordering-status-bar ${isOpen ? (deliveryAvailable ? 'open' : 'pickup-only') : 'closed'}`}>
            <span className="ordering-status-bar-dot" />
            <span className="ordering-status-bar-text">
              {isOpen
                ? deliveryAvailable
                  ? `Online ordering is open${currentClose ? ` · Closes ${fmtOrderingTime(currentClose)}` : ''}${waitMinutes !== null ? ` · ~${waitMinutes} min` : ''}`
                  : `Online ordering is open · Pickup only${nextDeliveryWindow ? ` · Delivery from ${fmtOrderingTime(nextDeliveryWindow)}` : ''}${currentClose ? ` · Closes ${fmtOrderingTime(currentClose)}` : ''}`
                : `Online ordering is closed${nextOpenWindow ? ` · Opens ${fmtOrderingTime(nextOpenWindow)}` : ''}`
              }
            </span>
          </div>
        )}

        {deliveryFallback && (
          <div
            role="status"
            style={{
              margin: '0 var(--page-gutter)',
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--color-primary-light, #FFF7ED)',
              border: '1px solid var(--color-primary, #D4813A)',
              fontSize: '0.875rem',
              color: 'var(--color-text)',
            }}
          >
            Delivery is unavailable for these items — you&apos;re viewing the <strong>pickup</strong> menu.
          </div>
        )}

        {/* Mobile category picker — sticky trigger */}
        <div className="mobile-category-pills cat-trigger-bar">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.6rem var(--page-gutter)' }}>
            <button
              className="cat-sheet-trigger"
              onClick={() => setCatSheetOpen(true)}
              aria-label="Browse categories"
            >
              <span style={{ fontSize: '1rem', lineHeight: 1 }}>☰</span>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeCatLabel}{activeSubLabel ? ` › ${activeSubLabel}` : ''}
              </span>
              <span style={{ fontSize: '0.75rem', opacity: 0.5, flexShrink: 0 }}>▾</span>
            </button>
            {!loading && (
              <span style={{ flexShrink: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-primary-light)', padding: '0.25rem 0.6rem', borderRadius: 999, whiteSpace: 'nowrap' }}>
                {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
              </span>
            )}
            {(activeCategoryId !== null || activeSubId !== null) && (
              <button
                onClick={() => { setActiveCategoryId(null); setActiveSubId(null); }}
                style={{ flexShrink: 0, padding: '0 0.6rem', height: '36px', border: '1.5px solid var(--color-border)', borderRadius: '999px', background: 'transparent', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--color-text-muted)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                aria-label="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category bottom sheet */}
        {catSheetOpen && typeof document !== 'undefined' && createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setCatSheetOpen(false)}
          >
            <div
              className="cat-sheet-panel"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--color-border)', margin: '0 auto 1.25rem' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-dark)' }}>Browse Menu</h3>
                <button onClick={() => setCatSheetOpen(false)} style={{ background: 'var(--color-primary-light)', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', fontSize: '1.1rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              {/* All Items */}
              <button
                className={`cat-sheet-item${activeCategoryId === null ? ' active' : ''}`}
                onClick={() => { setActiveCategoryId(null); setActiveSubId(null); setCatSheetOpen(false); }}
              >
                <span>🍽️ All Items</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{items.length} items</span>
                  {activeCategoryId === null && <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>✓</span>}
                </span>
              </button>

              {/* Parent category grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.75rem' }}>
                {categories.filter((cat) => !cat.parent_id).map((cat) => {
                  const isActive = activeCategoryId === cat.id;
                  const count = catItemCounts[cat.id] ?? 0;
                  const hasSubs = categories.some((c) => c.parent_id === cat.id);
                  return (
                    <button
                      key={cat.id}
                      className={`cat-sheet-card${isActive ? ' active' : ''}`}
                      onClick={() => {
                        setActiveCategoryId(cat.id);
                        setActiveSubId(null);
                        if (!hasSubs) setCatSheetOpen(false);
                      }}
                    >
                      {cat.image_url && (
                        <img src={cat.image_url.startsWith('http') ? cat.image_url : `${window.location.origin}${cat.image_url}`}
                          alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', marginBottom: 4, display: 'block', margin: '0 auto 4px' }} />
                      )}
                      <span style={{ display: 'block', lineHeight: 1.3 }}>{cat.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 3 }}>
                        <span style={{ fontSize: '0.68rem', opacity: 0.5, fontWeight: 500 }}>{count > 0 ? `${count} items` : ''}{hasSubs ? (count > 0 ? ' · subs' : 'subs') : ''}</span>
                        {isActive && <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 800 }}>✓</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Subcategory chips */}
              {sheetSubs.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '0.6rem' }}>
                    {activeCatLabel} — pick a section
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <button
                      className={`sub-pill${activeSubId === null ? ' active' : ''}`}
                      onClick={() => { setActiveSubId(null); setCatSheetOpen(false); }}
                    >
                      All {catItemCounts[activeCategoryId!] ? `(${catItemCounts[activeCategoryId!]})` : ''}
                    </button>
                    {sheetSubs.map((sub) => (
                      <button
                        key={sub.id}
                        className={`sub-pill${activeSubId === sub.id ? ' active' : ''}`}
                        onClick={() => { setActiveSubId(sub.id); setCatSheetOpen(false); }}
                      >
                        {sub.name}{catItemCounts[sub.id] ? ` (${catItemCounts[sub.id]})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1.25rem var(--page-gutter) 0', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', pointerEvents: 'none', opacity: 0.4 }}>🔍</span>
            <input
              type="text"
              placeholder={t('menu.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', height: 'var(--input-height)',
                padding: '0 0.875rem 0 2.25rem',
                border: '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: '0.9rem', outline: 'none',
                fontFamily: 'inherit', background: 'var(--color-surface)',
                color: 'var(--color-text)',
                transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; }}
              aria-label="Search menu items"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              height: 'var(--input-height)',
              padding: '0 0.875rem',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              fontSize: '0.875rem',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
            }}
            aria-label="Sort items"
          >
            <option value="name">Sort: A–Z</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
          {onSaleCount > 0 && (
            <button
              type="button"
              onClick={() => setOnSaleOnly((v) => !v)}
              style={{
                height: 'var(--input-height)',
                padding: '0 1rem',
                border: onSaleOnly ? '2px solid #dc2626' : '1.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: '0.875rem',
                fontWeight: 700,
                background: onSaleOnly ? 'linear-gradient(135deg, #dc2626, #ea580c)' : 'var(--color-surface)',
                color: onSaleOnly ? '#fff' : '#dc2626',
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              aria-pressed={onSaleOnly}
            >
              {onSaleOnly ? 'Showing deals' : `Deals (${onSaleCount})`}
            </button>
          )}
        </div>

        {/* Category heading on desktop */}
        {!loading && activeCategoryId !== null && (
          <div style={{ padding: '1rem var(--page-gutter) 0' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
              {categories.find((c) => c.id === activeCategoryId)?.name ?? ''}
            </h2>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', padding: '1.25rem var(--page-gutter)' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ borderRadius: '16px', height: '300px' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredItems.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <p className="empty-state-title">
              {searchQuery ? `No results for "${searchQuery}"` : 'Nothing here yet'}
            </p>
            <p className="empty-state-sub">
              {searchQuery ? 'Try a different search term.' : 'Check back soon.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ marginTop: '1rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' }}
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Items grid */}
        {!loading && filteredItems.length > 0 && (
          <div>
            {itemGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <div style={{ padding: `${gi === 0 ? '1.25rem' : '0.5rem'} var(--page-gutter) 0.5rem` }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      {group.label}
                    </h3>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', padding: `${group.label || gi > 0 ? '0' : '1.25rem'} var(--page-gutter) 1.25rem` }}>
                  {group.items.map((item) => (
                    <div key={item.id} className="menu-item-anim">
                      <MenuCard
                        item={item}
                        onSelectItem={(it, qty) => handleSelectItem(it, qty)}
                        onAddToCart={(it, qty, variant) => { addItem(it, qty, [], variant ?? null); showToast(variant ? `${it.name} (${variant.name}) added` : `${it.name} added to cart`); }}
                        isFavourite={favouriteIds.has(item.id)}
                        onToggleFavourite={handleToggleFavourite}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop cart sidebar ─────────────────────────────────── */}
      <aside
        className="cart-sidebar"
        style={{ width: '280px', flexShrink: 0, position: 'sticky', top: '80px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: '1.5rem 0' }}
      >
        <CartDrawer isOpen={isOpen ?? true} closedMessage={closedMessage} />
      </aside>

      {/* ── Mobile cart bottom sheet (portal → body; open via header/bottom Cart → ?openCart=1) ── */}
      {cartVisible && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('cart.title')}
          style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)' as unknown as number, background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setCartVisible(false); }}
        >
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'var(--color-surface)',
              borderRadius: '20px 20px 0 0',
              padding: '1.25rem var(--page-gutter)',
              paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
              maxHeight: '85vh', overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
            className="animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {t('cart.title')}
              </span>
              <button
                type="button"
                onClick={() => setCartVisible(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', padding: '0.25rem', lineHeight: 1 }}
                aria-label="Close cart"
              >
                ✕
              </button>
            </div>
            <CartDrawer isOpen={isOpen ?? true} closedMessage={closedMessage} compact />
          </div>
        </div>,
        document.body,
      )}

      {/* ── Back to top FAB ─────────────────────────────────────── */}
      <button
        className={`back-to-top${showBackToTop ? '' : ' hidden'}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
      >
        ↑
      </button>

      {/* ── Item modifier modal ──────────────────────────────────── */}
      {selectedItem && (
        <ItemModal
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

// ─── Sidebar category button ──────────────────────────────────────────────────
function CatButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={active ? undefined : 'cat-btn-hover'}
      style={{
        padding: '0.6rem 0.875rem',
        borderRadius: '10px',
        border: '1.5px solid',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        background: active ? 'var(--color-primary)' : 'var(--color-surface)',
        color: active ? 'white' : 'var(--color-text)',
        fontSize: '0.875rem', fontWeight: active ? 600 : 400,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
        width: '100%',
      }}
    >
      {label}
    </button>
  );
}
