Sausageimport { useEffect, useMemo, useState } from "react";
import {
  API_ORIGIN,
  Category,
  Item,
  Modifier,
  createCustomerOrder,
  fetchCategories,
  fetchCustomerOrders,
  fetchItems,
  getCustomerMe,
  requestOtp,
  verifyOtp,
} from "./api";

function MenuCard({
  item,
  onSelectItem,
  onAddToCartWithQuantity,
}: {
  item: Item;
  onSelectItem: (item: Item) => void;
  onAddToCartWithQuantity: (item: Item, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e9ecef',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'all 0.3s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-6px)';
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.12)';
        e.currentTarget.style.borderColor = '#1ba3b9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
        e.currentTarget.style.borderColor = '#e9ecef';
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectItem(item)}
        onKeyDown={(e) => e.key === 'Enter' && onSelectItem(item)}
        style={{
          width: '100%',
          height: '180px',
          background: item.image_url
            ? undefined
            : `linear-gradient(${45 + (item.id * 30)}deg, rgba(102, 126, 234, 0.4), rgba(118, 75, 162, 0.4))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '4rem',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {item.image_url ? (
          <img
            src={item.image_url.startsWith('http') ? item.image_url : `${API_ORIGIN}${item.image_url.startsWith('/') ? '' : '/'}${item.image_url}`}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          '🍽️'
        )}
      </div>
      <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '0.25rem', color: '#2d3436' }}>
          {item.name}
        </h3>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1ba3b9', marginBottom: '0.5rem' }}>
          MVR {typeof item.base_price === 'number' ? item.base_price.toFixed(2) : item.base_price}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e9ecef', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.max(1, q - 1)); }}
              style={{ width: '36px', height: '36px', background: '#f1f3f5', border: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 600 }}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span style={{ minWidth: '2.5rem', textAlign: 'center', fontWeight: 600, color: '#2d3436' }}>{quantity}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQuantity((q) => q + 1); }}
              style={{ width: '36px', height: '36px', background: '#f1f3f5', border: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 600 }}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, minWidth: '120px', padding: '0.6rem 1rem', fontSize: '0.95rem', borderRadius: '10px' }}
            onClick={(e) => { e.stopPropagation(); onAddToCartWithQuantity(item, quantity); }}
          >
            Add to cart ({quantity})
          </button>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', borderRadius: '10px', background: 'transparent', color: '#1ba3b9', border: '1px solid #1ba3b9' }}
          onClick={(e) => { e.stopPropagation(); onSelectItem(item); }}
        >
          Customize (modifiers)
        </button>
      </div>
    </div>
  );
}

type CartItem = {
  item: Item;
  quantity: number;
  modifiers: Modifier[];
};

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => {
    // Import cart from main website if exists
    try {
      const mainWebsiteCart = localStorage.getItem('bakegrill_cart');
      if (mainWebsiteCart) {
        const items = JSON.parse(mainWebsiteCart);
        // Convert main website cart format to app cart format
        return items.map((item: any) => {
          const foundItem = items.find((i: Item) => i.id === item.id);
          return {
            item: foundItem || {
              id: item.id,
              name: item.name,
              base_price: item.price,
              category_id: 1,
            },
            quantity: item.quantity || 1,
            modifiers: [],
          };
        });
      }
    } catch (e) {
      console.error('Failed to import cart:', e);
    }
    return [];
  });
  const [pickupNotes, setPickupNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("online_token");
  });
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [orders, setOrders] = useState<
    Array<{ id: number; order_number: string; status: string; total: number }>
  >([]);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchItems()])
      .then(([categoriesResponse, itemsResponse]) => {
        console.log('Menu loaded:', categoriesResponse.data.length, 'categories', itemsResponse.data.length, 'items');
        setCategories(categoriesResponse.data);
        setItems(itemsResponse.data);
        setActiveCategoryId(categoriesResponse.data[0]?.id ?? null);
        
        // Import cart from main website after items are loaded
        try {
          const mainWebsiteCart = localStorage.getItem('bakegrill_cart');
          if (mainWebsiteCart && cart.length === 0) {
            const cartItems = JSON.parse(mainWebsiteCart);
            const importedCart = cartItems.map((cartItem: any) => {
              const foundItem = itemsResponse.data.find((i: Item) => i.id === cartItem.id);
              if (foundItem) {
                return {
                  item: foundItem,
                  quantity: cartItem.quantity || 1,
                  modifiers: [],
                };
              }
              return null;
            }).filter(Boolean);
            
            if (importedCart.length > 0) {
              setCart(importedCart);
              console.log('Imported', importedCart.length, 'items from main website cart');
              // Clear the main website cart after import
              localStorage.removeItem('bakegrill_cart');
            }
          }
        } catch (e) {
          console.error('Failed to import cart:', e);
        }
      })
      .catch((error) => {
        console.error('Failed to load menu:', error);
        setStatusMessage("Unable to load the menu: " + error.message);
      });
  }, []);

  useEffect(() => {
    if (!token) {
      setCustomerName(null);
      setOrders([]);
      return;
    }

    getCustomerMe(token)
      .then((response) => {
        setCustomerName(response.customer.name || response.customer.phone);
      })
      .catch(() => setCustomerName(null));

    fetchCustomerOrders(token)
      .then((response) => setOrders(response.data))
      .catch(() => setOrders([]));
  }, [token]);

  const filteredItems = useMemo(() => {
    let filtered = items;
    
    // Filter by category
    if (activeCategoryId) {
      filtered = filtered.filter((item) => item.category_id === activeCategoryId);
    }
    
    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter((item) => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Sort
    if (sortBy === 'price-low') {
      filtered = [...filtered].sort((a, b) => parseFloat(String(a.base_price)) - parseFloat(String(b.base_price)));
    } else if (sortBy === 'price-high') {
      filtered = [...filtered].sort((a, b) => parseFloat(String(b.base_price)) - parseFloat(String(a.base_price)));
    } else {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return filtered;
  }, [items, activeCategoryId, searchQuery, sortBy]);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, entry) => {
      const modifiersTotal = entry.modifiers.reduce(
        (sum, modifier) => sum + parseFloat(String(modifier.price)),
        0
      );
      const itemPrice = parseFloat(String(entry.item.base_price));
      return total + (itemPrice + modifiersTotal) * entry.quantity;
    }, 0);
  }, [cart]);

  const handleRequestOtp = async () => {
    setIsLoading(true);
    setAuthError("");
    setOtpHint(null);
    try {
      const response = await requestOtp(phone);
      setOtpRequested(true);
      setStatusMessage("OTP sent. Please check your SMS.");
      if (response.otp) {
        setOtpHint(`Dev OTP: ${response.otp}`);
      }
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setAuthError("");
    try {
      const response = await verifyOtp({ phone, otp });
      setToken(response.token);
      localStorage.setItem("online_token", response.token);
      setOtpRequested(false);
      setOtp("");
      setStatusMessage("Logged in successfully.");
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("online_token");
  };

  const handleSelectItem = (item: Item) => {
    setSelectedItem(item);
    setSelectedModifiers([]);
  };

  const toggleModifier = (modifier: Modifier) => {
    setSelectedModifiers((current) => {
      const exists = current.some((entry) => entry.id === modifier.id);
      if (exists) {
        return current.filter((entry) => entry.id !== modifier.id);
      }
      return [...current, modifier];
    });
  };

  const addSelectedToCart = () => {
    if (!selectedItem) {
      return;
    }
    setCart((current) => {
      const existingIndex = current.findIndex(
        (entry) =>
          entry.item.id === selectedItem.id &&
          entry.modifiers.map((m) => m.id).join(",") ===
            selectedModifiers.map((m) => m.id).join(",")
      );

      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + 1,
        };
        return next;
      }

      return [
        ...current,
        { item: selectedItem, quantity: 1, modifiers: selectedModifiers },
      ];
    });
    setSelectedItem(null);
    setSelectedModifiers([]);
  };

  const updateCartQuantity = (index: number, quantity: number) => {
    setCart((current) => {
      const next = [...current];
      if (quantity <= 0) {
        next.splice(index, 1);
        return next;
      }
      next[index] = { ...next[index], quantity };
      return next;
    });
  };

  const addItemToCartWithQuantity = (item: Item, quantity: number) => {
    if (quantity < 1) return;
    setCart((current) => {
      const existingIndex = current.findIndex(
        (entry) => entry.item.id === item.id && entry.modifiers.length === 0
      );
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + quantity,
        };
        return next;
      }
      return [...current, { item, quantity, modifiers: [] }];
    });
  };

  const handleCheckout = async () => {
    if (!token || cart.length === 0) {
      return;
    }
    setIsLoading(true);
    setStatusMessage("");
    try {
      await createCustomerOrder(token, {
        customer_notes: pickupNotes || undefined,
        type: 'online_pickup',
        items: cart.map((entry) => ({
          item_id: entry.item.id,
          quantity: entry.quantity,
          modifiers: entry.modifiers.map((modifier) => ({
            modifier_id: modifier.id,
          })),
        })),
      });
      setCart([]);
      setPickupNotes("");
      setStatusMessage("Order placed! We will start preparing it.");
      const history = await fetchCustomerOrders(token);
      setOrders(history.data);
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Header - forced visible with inline styles */}
        <header style={{
          position: 'sticky',
          top: 0,
          background: '#ffffff',
          borderBottom: '1px solid #e9ecef',
          zIndex: 100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'block',
          width: '100%',
        }}>
          <div style={{
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '1rem 2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <a href="/" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '1.4rem',
              fontWeight: 600,
              color: '#1c1e21',
              textDecoration: 'none',
            }}>
              <img src="/logo.svg" alt="Bake & Grill" style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                display: 'block',
              }} />
              <span>Bake & Grill</span>
            </a>
            <nav style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <a href="/" style={{ fontWeight: 500, textDecoration: 'none', color: 'inherit' }}>Home</a>
              <a href="/menu" style={{ fontWeight: 500, textDecoration: 'none', color: 'inherit' }}>Menu</a>
            </nav>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-12" style={{ 
          background: 'linear-gradient(135deg, rgba(27, 163, 185, 0.1) 0%, rgba(184, 168, 144, 0.1) 100%)',
          backgroundSize: '400% 400%',
        }}>
          <div style={{ maxWidth: '500px', width: '100%' }}>
            {/* Hero text above login card */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🍽️</div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--dark)', marginBottom: '0.75rem' }}>
                Order Fresh Food
              </h1>
              <p style={{ fontSize: '1.1rem', color: '#636e72' }}>
                Quick, easy, and delicious - delivered to you
              </p>
            </div>

            {/* Beautiful login card */}
            <div style={{
              background: 'white',
              borderRadius: '24px',
              padding: '2.5rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
              border: '1px solid rgba(27, 163, 185, 0.2)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--dark)', marginBottom: '0.5rem' }}>
                  Sign In
                </h2>
                <p style={{ color: '#636e72', fontSize: '0.95rem' }}>
                  We'll send you a verification code via SMS
                </p>
              </div>

          <div style={{ marginTop: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.75rem', color: 'var(--dark)', fontSize: '0.95rem' }}>
              📱 Phone Number
            </label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              style={{
                width: '100%',
                padding: '1rem 1.25rem',
                border: '2px solid var(--border)',
                borderRadius: '12px',
                fontSize: '1rem',
                transition: 'all 0.2s',
              }}
              placeholder="7820288 or +9607820288"
              onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />

            {otpRequested && (
              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '0.75rem', color: 'var(--dark)', fontSize: '0.95rem' }}>
                  🔐 Verification Code
                </label>
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '1rem 1.25rem',
                    border: '2px solid var(--border)',
                    borderRadius: '12px',
                    fontSize: '1.5rem',
                    letterSpacing: '0.5rem',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                  }}
                  placeholder="● ● ● ● ● ●"
                  maxLength={6}
                  onFocus={(e) => e.target.style.borderColor = 'var(--teal)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            )}

            {otpHint && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '8px', fontSize: '0.85rem', color: '#856404' }}>
                💡 {otpHint}
              </div>
            )}
            {authError && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8d7da', borderRadius: '8px', fontSize: '0.9rem', color: '#721c24' }}>
                ⚠️ {authError}
              </div>
            )}
            {statusMessage && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#d4edda', borderRadius: '8px', fontSize: '0.9rem', color: '#155724' }}>
                ✓ {statusMessage}
              </div>
            )}

            <div style={{ marginTop: '2rem' }}>
              {!otpRequested ? (
                <button
                  onClick={handleRequestOtp}
                  disabled={isLoading}
                  className="btn-primary w-full"
                  style={{ fontSize: '1.1rem', padding: '1.25rem' }}
                >
                  {isLoading ? 'Sending...' : 'Send Verification Code →'}
                </button>
              ) : (
                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading}
                  className="btn-primary w-full"
                  style={{ fontSize: '1.1rem', padding: '1.25rem' }}
                >
                  {isLoading ? 'Verifying...' : 'Verify & Continue →'}
                </button>
              )}
            </div>
            
            <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: '#95a5a6' }}>
              🔒 Your privacy is protected. See our <a href="/privacy" style={{ color: 'var(--teal)', textDecoration: 'underline' }}>privacy policy</a>
            </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - exact match to main website */}
      <footer className="footer">
        <div className="footer-content">
          <div>
            <h3>Bake & Grill Café</h3>
            <p>Authentic Dhivehi cuisine, fresh pastries, and premium grills in Malé.</p>
          </div>
          <div>
            <h3>Location</h3>
            <p>Majeedhee Magu, Malé, Maldives</p>
            <p>Near ferry terminal</p>
          </div>
          <div>
            <h3>Quick Links</h3>
            <a href="http://localhost:8000/menu">Menu</a>
            <a href="http://localhost:8000/hours">Opening Hours</a>
            <a href="http://localhost:8000/contact">Contact Us</a>
            <a href="http://localhost:8000/privacy">Privacy Policy</a>
          </div>
          <div>
            <h3>Contact</h3>
            <p>+960 9120011</p>
            <p>hello@bakeandgrill.mv</p>
            <a href="https://wa.me/9609120011" target="_blank">WhatsApp</a>
          </div>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} Bake & Grill. All rights reserved.
        </div>
      </footer>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Header - exact match to main website */}
      <header style={{
        position: 'sticky',
        top: 0,
        background: '#ffffff',
        borderBottom: '1px solid #e9ecef',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'block',
        width: '100%',
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <a href="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '1.4rem',
            fontWeight: 600,
            color: '#1c1e21',
            textDecoration: 'none',
          }}>
            <img src="/logo.svg" alt="Bake & Grill" style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              display: 'block',
            }} />
            <span>Bake & Grill</span>
          </a>
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {customerName && (
              <span style={{ fontSize: '0.9rem', color: '#636e72' }}>Hi, {customerName}</span>
            )}
            <button onClick={handleLogout} style={{
              background: 'transparent',
              color: '#1ba3b9',
              border: '1px solid #1ba3b9',
              padding: '0.5rem 1.25rem',
              borderRadius: '999px',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}>
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 grid gap-6 px-6 py-6 lg:grid-cols-12 max-w-7xl mx-auto w-full" style={{ background: '#fafbfc', minHeight: '60vh' }}>
        {statusMessage && (
          <div className="lg:col-span-12 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {statusMessage}
          </div>
        )}
        
        <section className="lg:col-span-3 space-y-3">
          <h2 className="text-sm font-semibold text-slate-500">Categories</h2>
          <div className="space-y-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                className="w-full rounded-lg px-4 py-3 text-left font-medium transition-all"
                style={{
                  background: activeCategoryId === category.id ? 'var(--teal)' : 'white',
                  color: activeCategoryId === category.id ? 'white' : 'var(--text)',
                  border: `1px solid ${activeCategoryId === category.id ? 'var(--teal)' : 'var(--border)'}`,
                }}
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        {/* Full Menu Grid - 5 items per row like event page */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6" style={{ marginBottom: '2rem' }}>
          {filteredItems.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              onSelectItem={handleSelectItem}
              onAddToCartWithQuantity={addItemToCartWithQuantity}
            />
          ))}
        </div>

        {/* Cart - Fixed Bottom on Mobile, Sidebar on Desktop */}
        <div style={{
          position: window.innerWidth < 768 ? 'fixed' : 'sticky',
          bottom: window.innerWidth < 768 ? 0 : 'auto',
          top: window.innerWidth < 768 ? 'auto' : '90px',
          left: 0,
          right: 0,
          background: 'white',
          border: '1px solid #e9ecef',
          borderRadius: window.innerWidth < 768 ? '20px 20px 0 0' : '16px',
          padding: '1.5rem',
          boxShadow: window.innerWidth < 768 ? '0 -4px 20px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.04)',
          zIndex: 100,
          maxWidth: window.innerWidth < 768 ? '100%' : '400px',
          marginLeft: window.innerWidth < 768 ? 0 : 'auto',
        }}>
          <div className="cart-card">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--dark)' }}>Your Cart</h2>
            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Your cart is empty.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {cart.map((entry, index) => (
                  <div
                    key={`${entry.item.id}-${index}`}
                    className="rounded-lg border border-slate-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        {entry.item.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateCartQuantity(index, entry.quantity - 1)
                          }
                          className="h-6 w-6 rounded-full border border-slate-200 text-xs"
                        >
                          -
                        </button>
                        <span className="text-xs">{entry.quantity}</span>
                        <button
                          onClick={() =>
                            updateCartQuantity(index, entry.quantity + 1)
                          }
                          className="h-6 w-6 rounded-full border border-slate-200 text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {entry.modifiers.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        + {entry.modifiers.map((modifier) => modifier.name).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>MVR {typeof cartTotal === 'number' ? cartTotal.toFixed(2) : cartTotal}</span>
                </div>
              </div>
            )}
            <textarea
              value={pickupNotes}
              onChange={(event) => setPickupNotes(event.target.value)}
              placeholder="Pickup notes (optional)"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
            />
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isLoading}
              className="btn-primary w-full mt-4 text-lg"
            >
              {isLoading ? 'Processing...' : 'Place Order 🛒'}
            </button>
            {statusMessage && (
              <p className="mt-2 text-xs text-emerald-600">{statusMessage}</p>
            )}
          </div>

          <div className="cart-card">
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--dark)' }}>
              Order History
            </h2>
            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No orders yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-slate-100 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{order.order_number}</span>
                      <span className="text-xs text-slate-500">
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      MVR {order.total ? (typeof order.total === 'number' ? order.total.toFixed(2) : order.total) : '0.00'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer - exact match to main website */}
      <footer className="footer">
        <div className="footer-content">
          <div>
            <h3>Bake & Grill Café</h3>
            <p>Authentic Dhivehi cuisine, fresh pastries, and premium grills in Malé.</p>
          </div>
          <div>
            <h3>Location</h3>
            <p>Majeedhee Magu, Malé, Maldives</p>
            <p>Near ferry terminal</p>
          </div>
          <div>
            <h3>Quick Links</h3>
            <a href="http://localhost:8000/menu">Menu</a>
            <a href="http://localhost:8000/hours">Opening Hours</a>
            <a href="http://localhost:8000/contact">Contact Us</a>
            <a href="http://localhost:8000/privacy">Privacy Policy</a>
          </div>
          <div>
            <h3>Contact</h3>
            <p>+960 9120011</p>
            <p>hello@bakeandgrill.mv</p>
            <a href="https://wa.me/9609120011" target="_blank">WhatsApp</a>
          </div>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} Bake & Grill. All rights reserved.
        </div>
      </footer>

      {selectedItem && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedItem.name}</h3>
                <p className="text-sm text-slate-500">
                  MVR {typeof selectedItem.base_price === 'number' ? selectedItem.base_price.toFixed(2) : selectedItem.base_price}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-sm text-slate-400"
              >
                Close
              </button>
            </div>
            {selectedItem.modifiers && selectedItem.modifiers.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  Modifiers
                </p>
                {selectedItem.modifiers.map((modifier) => (
                  <label
                    key={modifier.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <span>
                      {modifier.name} (+MVR {typeof modifier.price === 'number' ? modifier.price.toFixed(2) : modifier.price})
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedModifiers.some(
                        (entry) => entry.id === modifier.id
                      )}
                      onChange={() => toggleModifier(modifier)}
                      className="h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No modifiers for this item.
              </p>
            )}
            <button
              onClick={addSelectedToCart}
              className="mt-5 w-full rounded-full px-6 py-3 text-base font-semibold text-white transition-all hover:shadow-lg"
              style={{ background: 'var(--teal)' }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
