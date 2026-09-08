import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Section bar shared by the Ordering and Delivery tabs of Settings.
 * Four sections live on /settings/ordering (?section=…); Delivery is the
 * neighbouring Settings tab, so the two pages read as one.
 */
const TABS = [
  { id: 'online', to: '/settings/ordering', label: 'Online' },
  { id: 'features', to: '/settings/ordering?section=features', label: 'Features' },
  { id: 'slots-fees', to: '/settings/ordering?section=slots-fees', label: 'Slots' },
  { id: 'preorder', to: '/settings/ordering?section=events', label: 'Pre-order' },
  { id: 'delivery', to: '/settings/delivery', label: 'Delivery' },
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
  if (pathname === '/settings/delivery' || pathname.startsWith('/settings/delivery/') || pathname === '/delivery-settings') {
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
