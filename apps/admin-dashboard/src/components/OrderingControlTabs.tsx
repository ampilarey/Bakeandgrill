import { useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'online', to: '/online-ordering', label: 'Online Ordering' },
  { id: 'preorder', to: '/online-ordering?section=events', label: 'Pre-order' },
  { id: 'delivery', to: '/delivery-settings', label: 'Delivery & Zones' },
] as const;

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-secondary)',
});

function isTabActive(pathname: string, search: string, tabId: (typeof TABS)[number]['id']): boolean {
  if (tabId === 'delivery') {
    return pathname === '/delivery-settings' || pathname.startsWith('/delivery-settings/');
  }
  if (pathname !== '/online-ordering' && !pathname.startsWith('/online-ordering/')) {
    return false;
  }
  const section = new URLSearchParams(search).get('section');
  if (tabId === 'preorder') {
    return section === 'events';
  }
  // Online Ordering tab — any section except events
  return section !== 'events';
}

export function OrderingControlTabs() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          style={tabStyle(isTabActive(pathname, search, tab.id))}
          onClick={() => navigate(tab.to)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
