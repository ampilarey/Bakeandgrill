import { useLocation, useNavigate } from 'react-router-dom';
import { useInHub } from './hubContext';

/**
 * Section bar shared by the Ordering and Delivery tabs of Settings.
 * Four sections live on /settings/ordering (?section=…); Delivery is the
 * neighbouring Settings tab, so the two pages read as one.
 */
const TABS = [
  { id: 'online', to: '/settings/ordering', label: 'Online' },
  { id: 'features', to: '/settings/ordering?section=features', label: 'Features' },
  { id: 'slots-fees', to: '/settings/ordering?section=slots-fees', label: 'Fees & slots' },
  { id: 'preorder', to: '/settings/ordering?section=events', label: 'Pre-order' },
  { id: 'delivery', to: '/settings/delivery', label: 'Delivery' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Padding, size and height are in index.css (.oc-tabbar > button), so a phone can tighten them. */
const tabStyle = (active: boolean): React.CSSProperties => ({
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-secondary)',
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
  // Inside Settings the hub's own tabs already offer Delivery (nav audit,
  // 2026-10-16): the inner row keeps the ordering sections only, and the
  // Delivery tab shows no inner row at all.
  const inHub = useInHub();
  if (inHub && active === 'delivery') return null;
  const tabs = inHub ? TABS.filter((tab) => tab.id !== 'delivery') : TABS;

  return (
    <div className="oc-tabbar" role="tablist" aria-label="Ordering sections">
      {tabs.map((tab) => (
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
