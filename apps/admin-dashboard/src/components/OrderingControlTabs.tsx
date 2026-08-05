import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Single tab bar for the whole Ordering Control hub.
 * Four sections live on /online-ordering (?section=…); Delivery is its own route.
 */
const TABS = [
  { id: 'online', to: '/online-ordering', label: 'Online' },
  { id: 'features', to: '/online-ordering?section=features', label: 'Features' },
  { id: 'slots-fees', to: '/online-ordering?section=slots-fees', label: 'Slots' },
  { id: 'preorder', to: '/online-ordering?section=events', label: 'Pre-order' },
  { id: 'delivery', to: '/delivery-settings', label: 'Delivery' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-secondary)',
  minHeight: 40,
});

function activeTab(pathname: string, search: string): TabId {
  if (pathname === '/delivery-settings' || pathname.startsWith('/delivery-settings/')) {
    return 'delivery';
  }
  const section = new URLSearchParams(search).get('section');
  if (section === 'events') return 'preorder';
  if (section === 'features') return 'features';
  if (section === 'pickup' || section === 'fees' || section === 'slots-fees') return 'slots-fees';
  return 'online';
}

export function OrderingControlTabs() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const active = activeTab(pathname, search);

  return (
    <div className="oc-tabbar" role="tablist" aria-label="Ordering control sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          style={tabStyle(active === tab.id)}
          onClick={() => navigate(tab.to)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
