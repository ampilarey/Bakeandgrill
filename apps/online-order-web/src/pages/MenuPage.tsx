import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCategories, fetchItems, fetchOpeningHoursStatus } from '../api';
import type { Category, Item, Modifier } from '../api';
import { MenuCard } from '../components/MenuCard';
import { ItemModal } from '../components/ItemModal';
import { CartDrawer } from '../components/CartDrawer';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

export function MenuPage() {
  const { addItem } = useCart();
  const { t } = useLanguage();

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

  // Refs for scrolling category pill into view
  const pillContainerRef = useRef<HTMLDivElement>(null);
  const activePillRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { document.title = 'Menu — Bake & Grill'; }, []);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchItems(), fetchOpeningHoursStatus()])
      .then(([cats, its, hours]) => {
        setCategories(cats.data);
        setItems(its.data);
        setActiveCategoryId(cats.data[0]?.id ?? null);
        setIsOpen(hours.open);
        setClosedMessage(hours.open ? null : (hours.message ?? 'We are currently closed.'));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

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
    if (sortBy === 'price-low') return [...list].sort((a, b) => parseFloat(String(a.base_price)) - parseFloat(String(b.base_price)));
    if (sortBy === 'price-high') return [...list].sort((a, b) => parseFloat(String(b.base_price)) - parseFloat(String(a.base_price)));
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
    setSelectedItem(null);
    setSelectedModifiers([]);
  };

  // Cart item count for FAB
  const { cart } = useCart();
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

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
        <div className="mobile-category-pills sticky-cat-bar" style={{ display: 'none' }}>
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
              <MenuCard
                key={item.id}
                item={item}
                onSelectItem={handleSelectItem}
                onAddToCart={addItem}
              />
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

      {/* ── Mobile floating cart button ──────────────────────────── */}
      <button
        className="mobile-cart-fab"
        onClick={() => setCartVisible(true)}
        aria-label={`View cart — ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
        style={{
          display: 'none',
          position: 'fixed',
          bottom: '1.25rem', right: '1.25rem',
          background: 'var(--color-primary)',
          color: 'white', border: 'none',
          borderRadius: 'var(--radius-full)',
          padding: '0.875rem 1.5rem',
          fontSize: '0.925rem', fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 20px var(--color-primary-glow)',
          zIndex: 50, fontFamily: 'inherit',
          alignItems: 'center', gap: '0.5rem',
        }}
      >
        🛒 Cart{cartCount > 0 ? ` (${cartCount})` : ''}
      </button>

      {/* ── Mobile cart bottom sheet ─────────────────────────────── */}
      {cartVisible && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setCartVisible(false); }}
        >
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'var(--color-surface)',
              borderRadius: '20px 20px 0 0',
              padding: '1.25rem 1.5rem',
              maxHeight: '85vh', overflowY: 'auto',
            }}
            className="animate-fade-in"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {t('cart.title')}
              </span>
              <button
                onClick={() => setCartVisible(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', padding: '0.25rem', lineHeight: 1 }}
                aria-label="Close cart"
              >
                ✕
              </button>
            </div>
            <CartDrawer isOpen={isOpen ?? true} closedMessage={closedMessage} />
          </div>
        </div>
      )}

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
      style={{
        padding: '0.6rem 0.875rem',
        borderRadius: '10px',
        border: '1.5px solid',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        background: active ? 'var(--color-primary)' : 'var(--color-surface)',
        color: active ? 'white' : 'var(--color-text)',
        fontSize: '0.875rem', fontWeight: active ? 600 : 400,
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s', fontFamily: 'inherit',
        width: '100%',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}}
    >
      {label}
    </button>
  );
}
