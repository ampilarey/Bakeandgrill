import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Shield, Smartphone, Link2 } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { WebsiteSettings } from './SettingsPage/WebsiteSettingsSubPage';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';
import { fetchDevices, enableDevice, disableDevice } from '../api';
import type { Device } from '../api';

// ─── Sub-page cards ───────────────────────────────────────────────────────────
const HUB_CARDS = [
  { id: 'website',      icon: Globe,       label: 'Website Settings', desc: 'Hero slides, homepage content, contact info, branding & SEO' },
  { id: 'permissions',  icon: Shield,      label: 'Roles & Permissions', desc: 'Manage role defaults and per-user overrides' },
  { id: 'devices',      icon: Smartphone,  label: 'Devices', desc: 'Register and manage POS/KDS devices' },
  { id: 'integrations', icon: Link2,       label: 'Integrations', desc: 'Xero, Webhooks, SMS provider' },
];

// ─── Devices sub-page ────────────────────────────────────────────────────────
function DevicesSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetchDevices()
      .then((res) => setDevices(res.data ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggle = async (device: Device) => {
    setToggling(device.id);
    try {
      const res = device.is_active ? await disableDevice(device.id) : await enableDevice(device.id);
      setDevices((ds) => ds.map((d) => d.id === device.id ? res.device : d));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setToggling(null);
    }
  };

  const typeIcon: Record<string, string> = { pos: '🖥️', kds: '📺', display: '📟' };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>
          Devices register automatically on first login. Disable to block a device from accessing the system.
        </p>
        <Button variant="secondary" onClick={load}>↻ Refresh</Button>
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading ? (
        <p style={{ fontSize: 13, color: '#9C8E7E' }}>Loading devices…</p>
      ) : devices.length === 0 ? (
        <Card><p style={{ margin: 0, fontSize: 13, color: '#9C8E7E', textAlign: 'center', padding: '16px 0' }}>No devices registered yet.</p></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {devices.map((d) => (
            <Card key={d.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{typeIcon[d.type] ?? '📱'}</span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#3D2B1F' }}>{d.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9C8E7E' }}>
                      {d.type.toUpperCase()}
                      {d.last_seen_at && ` · Last seen ${new Date(d.last_seen_at).toLocaleDateString()}`}
                      {d.registered_by && ` · Registered by ${d.registered_by}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: d.is_active ? '#DCFCE7' : '#FEE2E2', color: d.is_active ? '#166534' : '#991B1B' }}>
                    {d.is_active ? 'Active' : 'Disabled'}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => void handleToggle(d)}
                    disabled={toggling === d.id}
                  >
                    {toggling === d.id ? '…' : d.is_active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Integrations sub-page ────────────────────────────────────────────────────
function IntegrationsSettings() {
  const navigate = useNavigate();
  const integrations = [
    { label: 'Xero Accounting', desc: 'Sync invoices and expenses to Xero.', path: '/xero', icon: '📊' },
    { label: 'Webhooks', desc: 'Send real-time event payloads to external services.', path: '/webhooks', icon: '🔗' },
    { label: 'SMS Campaigns', desc: 'Send bulk SMS and manage campaigns.', path: '/sms', icon: '💬' },
  ];
  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {integrations.map((intg) => (
        <Card key={intg.path}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{intg.icon}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#3D2B1F' }}>{intg.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C8E7E' }}>{intg.desc}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate(intg.path)}>
              Open →
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Settings — Bake & Grill Admin';
  }, []);

  if (active) {
    const card = HUB_CARDS.find((c) => c.id === active) ?? HUB_CARDS[0];
    return (
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
          <button
            onClick={() => setActive(null)}
            style={{ color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0 }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#D4813A')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#9C8E7E')}
          >
            Settings
          </button>
          <span style={{ color: '#9C8E7E' }}>›</span>
          <span style={{ fontWeight: 600, color: '#1C1408' }}>{card.label}</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1C1408', margin: 0 }}>{card.label}</h1>
          <p style={{ fontSize: 14, color: '#9C8E7E', marginTop: 4 }}>{card.desc}</p>
        </div>

        {active === 'website'      && <WebsiteSettings />}
        {active === 'permissions'  && <PermissionsSettings />}
        {active === 'devices'      && <DevicesSettings />}
        {active === 'integrations' && <IntegrationsSettings />}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1C1408', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 14, color: '#9C8E7E', marginTop: 4 }}>Manage your business settings, permissions, and integrations</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {HUB_CARDS.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            style={{
              textAlign: 'left', padding: 20,
              background: '#fff', border: '1.5px solid #E8E0D8',
              borderRadius: 14, boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
              cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'rgba(212,129,58,0.4)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(28,20,8,0.08)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#E8E0D8';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(28,20,8,0.05)';
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,129,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4813A', marginBottom: 12 }}>
              <Icon size={20} />
            </div>
            <p style={{ fontWeight: 700, color: '#1C1408', fontSize: 14, margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 12, color: '#9C8E7E', lineHeight: 1.5, margin: 0 }}>{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
