import { useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { to: '/online-ordering', label: 'Online Ordering' },
  { to: '/delivery-settings', label: 'Delivery & Zones' },
] as const;

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: active ? '#D4813A' : 'transparent',
  color: active ? '#fff' : '#6B5D4F',
});

export function OrderingControlTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#F5F0EB', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
      {TABS.map((tab) => (
        <button
          key={tab.to}
          type="button"
          style={tabStyle(pathname === tab.to || pathname.startsWith(tab.to + '/'))}
          onClick={() => navigate(tab.to)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
