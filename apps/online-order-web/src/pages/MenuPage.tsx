import { useEffect, useMemo, useState } from 'react';
import { fetchCategories, fetchItems, fetchOpeningHoursStatus } from '../api';
import type { Category, Item, Modifier } from '../api';
import { MenuCard } from '../components/MenuCard';
import { ItemModal } from '../components/ItemModal';
import { CartDrawer } from '../components/CartDrawer';
import { useCart } from '../context/CartContext';

export function MenuPage() {
  const { addItem } = useCart();

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

  useEffect(() => {
    Promise.all([fetchCategories(), fetchItems(), fetchOpeningHoursStatus()])
      .then(([cats, its, hours]) => {
        setCategories(cats.data);
        setItems(its.data);
        setActiveCategoryId(cats.data[0]?.id ?? null);
        setIsOpen(hours.open);
        setClosedMessage(hours.open ? null : (hours.message ?? 'We are currently closed.'));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    let list = items;
    if (activeCategoryId) list = list.filter((i) => i.category_id === activeCategoryId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (sortBy === 'price-low') return [...list].sort((a, b) => parseFloat(String(a.base_price)) - parseFloat(String(b.base_price)));
    if (sortBy === 'price-high') return [...list].sort((a, b) => parseFloat(String(b.base_price)) - parseFloat(String(a.base_price)));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, activeCategoryId, searchQuery, sortBy]);

  const handleSelectItem = (item: Item) => {
    setSelectedItem(item);
    setSelectedModifiers([]);
  };

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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#636e72' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🍽️</div>
          <p>Loading menu…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#dc3545' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ marginBottom: '1rem' }}>Failed to load menu: {error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '0.6rem 1.5rem', background: '#1ba3b9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', gap: '1.5rem' }}>
      {/* Sidebar — categories */}
      <aside style={{ width: '200px', flexShrink: 0 }} className="menu-sidebar">
        <h2 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#adb5bd', marginBottom: '0.75rem' }}>
          Categories
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <button
            onClick={() => setActiveCategoryId(null)}
            style={{
              padding: '0.6rem 0.875rem',
              borderRadius: '10px',
              border: '1.5px solid',
              borderColor: activeCategoryId === null ? '#1ba3b9' : '#e9ecef',
              background: activeCategoryId === null ? '#1ba3b9' : 'white',
              color: activeCategoryId === null ? 'white' : '#495057',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              style={{
                padding: '0.6rem 0.875rem',
                borderRadius: '10px',
                border: '1.5px solid',
                borderColor: activeCategoryId === cat.id ? '#1ba3b9' : '#e9ecef',
                background: activeCategoryId === cat.id ? '#1ba3b9' : 'white',
                color: activeCategoryId === cat.id ? 'white' : '#495057',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Mobile category pills */}
        <div className="mobile-category-pills" style={{ display: 'none', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
          <button
            onClick={() => setActiveCategoryId(null)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '999px',
              border: '1.5px solid',
              borderColor: activeCategoryId === null ? '#1ba3b9' : '#e9ecef',
              background: activeCategoryId === null ? '#1ba3b9' : 'white',
              color: activeCategoryId === null ? 'white' : '#495057',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '999px',
                border: '1.5px solid',
                borderColor: activeCategoryId === cat.id ? '#1ba3b9' : '#e9ecef',
                background: activeCategoryId === cat.id ? '#1ba3b9' : 'white',
                color: activeCategoryId === cat.id ? 'white' : '#495057',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontFamily: 'inherit',
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Search + Sort */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#adb5bd', fontSize: '0.9rem', pointerEvents: 'none' }}>
              🔍
            </span>
            <input
              type="text"
              placeholder="Search items…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.875rem 0.65rem 2.25rem',
                border: '1.5px solid #e9ecef',
                borderRadius: '10px',
                fontSize: '0.875rem',
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#1ba3b9'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e9ecef'; }}
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '0.65rem 0.875rem',
              border: '1.5px solid #e9ecef',
              borderRadius: '10px',
              fontSize: '0.875rem',
              background: 'white',
              color: '#495057',
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="name">Sort: A–Z</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>

        {/* Items grid */}
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#adb5bd' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤷</div>
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>No items found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ marginTop: '1rem', color: '#1ba3b9', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
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

      {/* Desktop cart drawer */}
      <aside style={{ width: '280px', flexShrink: 0, position: 'sticky', top: '80px', alignSelf: 'flex-start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }} className="cart-sidebar">
        <CartDrawer isOpen={isOpen ?? true} closedMessage={closedMessage} />
      </aside>

      {/* Mobile floating cart button */}
      <button
        className="mobile-cart-fab"
        onClick={() => setCartVisible(true)}
        style={{
          display: 'none',
          position: 'fixed',
          bottom: '1.25rem',
          right: '1.25rem',
          background: '#1ba3b9',
          color: 'white',
          border: 'none',
          borderRadius: '999px',
          padding: '0.875rem 1.5rem',
          fontSize: '0.925rem',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(27,163,185,0.4)',
          zIndex: 50,
          fontFamily: 'inherit',
        }}
      >
        🛒 Cart
      </button>

      {/* Mobile cart modal */}
      {cartVisible && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' }}
          onClick={(e) => { if (e.target === e.currentTarget) setCartVisible(false); }}
        >
          <div style={{ width: '100%', background: 'white', borderRadius: '20px 20px 0 0', padding: '1.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>Your Cart</span>
              <button onClick={() => setCartVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: '#636e72' }}>✕</button>
            </div>
            <CartDrawer isOpen={isOpen ?? true} closedMessage={closedMessage} />
          </div>
        </div>
      )}

      {/* Item modifier modal */}
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
