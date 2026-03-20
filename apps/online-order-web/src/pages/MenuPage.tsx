import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchItems, fetchOpeningHoursStatus } from '../api';
import type { Category, Item, Modifier } from '../api';
import { MenuCard } from '../components/MenuCard';
import { ItemModal } from '../components/ItemModal';
import { CartDrawer } from '../components/CartDrawer';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { usePageTitle } from '../hooks/usePageTitle';

export function MenuPage() {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);

  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);

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

  usePageTitle('Menu');

  useEffect(() => {
    const categorySlug = searchParams.get('category');
    const itemId = searchParams.get('item') ? Number(searchParams.get('item')) : null;

    Promise.all([fetchCategories(), fetchItems(), fetchOpeningHoursStatus()])
      .then(([cats, its, hours]) => {
        setCategories(cats.data);
        setItems(its.data);

        // Pre-select category from ?category= query param, otherwise show All
        if (categorySlug) {
          const match = cats.data.find(
            (c) => c.name.toLowerCase().replace(/\s+/g, '-') === categorySlug,
          );
          setActiveCategoryId(match?.id ?? null);
        } else {
          setActiveCategoryId(null);
        }

        // BUG-12: auto-open item modal from ?item= query param
        if (itemId) {
          const match = its.data.find((i) => i.id === itemId);
          if (match) { setSelectedItem(match); setSelectedModifiers([]); }
        }

        setIsOpen(hours.open);
        setClosedMessage(hours.open ? null : (hours.message ?? 'We are currently closed.'));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (activeCategoryId !== null) list = list.filter((i) => i.category_id === activeCategoryId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (sortBy === 'price-low') return [...list].sort((a, b) => Number(a.base_price) - Number(b.base_price));
    if (sortBy === 'price-high') return [...list].sort((a, b) => Number(b.base_price) - Number(a.base_price));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, activeCategoryId, searchQuery, sortBy]);

  const handleSelectItem = (item: Item) => { setSelectedItem(item); setSelectedModifiers([]); };
  const toggleModifier = (mod: Modifier) => {
    setSelectedModifiers((prev) => {
      const exists = prev.some((m) => m.id === mod.id);
      return exists ? prev.filter((m) => m.id !== mod.id) : [...prev, mod];
    });
  };
  const handleModalAdd = () => {
    if (!selectedItem) return;
    addItem(selectedItem, 1, selectedModifiers);
    showToast(`${selectedItem.name} added to cart`);
    setSelectedItem(null);
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
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '0 0 5rem', display: 'flex', gap: '1.5rem', position: 'relative' }}>

      {/* ── Desktop sidebar categories ─────────────────────────── */}
      <aside style={{ width: '200px', flexShrink: 0, padding: '1.5rem 0 1.5rem 1.5rem' }} className="menu-sidebar">
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
                  onClick={() => setActiveCategoryId(null)}
                />
                {categories.map((cat) => (
                  <CatButton
                    key={cat.id}
                    label={cat.name}
                    active={activeCategoryId === cat.id}
                    onClick={() => setActiveCategoryId(cat.id)}
                  />
                ))}
              </>
            )
          }
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Mobile sticky category bar */}
        <div className="mobile-category-pills sticky-cat-bar">
          <div className="sticky-cat-bar-inner" ref={pillContainerRef}>
            <button
              className={`category-pill${activeCategoryId === null ? ' active' : ''}`}
              onClick={() => setActiveCategoryId(null)}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                ref={activeCategoryId === cat.id ? activePillRef : undefined}
                className={`category-pill${activeCategoryId === cat.id ? ' active' : ''}`}
                onClick={() => setActiveCategoryId(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem 0', flexWrap: 'wrap' }}>
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
        </div>

        {/* Category heading on desktop */}
        {!loading && activeCategoryId !== null && (
          <div style={{ padding: '1rem 1.5rem 0' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
              {categories.find((c) => c.id === activeCategoryId)?.name ?? ''}
            </h2>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', padding: '1.25rem 1.5rem' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem', padding: '1.25rem 1.5rem' }}>
            {filteredItems.map((item) => (
              <div key={item.id} className="menu-item-anim">
                <MenuCard
                  item={item}
                  onSelectItem={handleSelectItem}
                  onAddToCart={(it, qty) => { addItem(it, qty); showToast(`${it.name} added to cart`); }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop cart sidebar ─────────────────────────────────── */}
      <aside
        className="cart-sidebar"
        style={{ width: '280px', flexShrink: 0, position: 'sticky', top: '80px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: '1.5rem 1.5rem 1.5rem 0' }}
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
              padding: '1.25rem 1.5rem',
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
