import { useEffect, useState } from 'react';
import { Globe, Shield, Smartphone, Link2 } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { WebsiteSettings } from './SettingsPage/WebsiteSettingsSubPage';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';

// ─── Sub-page cards ───────────────────────────────────────────────────────────
const HUB_CARDS = [
  { id: 'website',      icon: Globe,       label: 'Website Settings', desc: 'Hero slides, homepage content, contact info, branding & SEO' },
  { id: 'permissions',  icon: Shield,      label: 'Roles & Permissions', desc: 'Manage role defaults and per-user overrides' },
  { id: 'devices',      icon: Smartphone,  label: 'Devices', desc: 'Register and manage POS/KDS devices' },
  { id: 'integrations', icon: Link2,       label: 'Integrations', desc: 'Xero, Webhooks, SMS provider' },
];

// ─── Devices sub-page (placeholder) ──────────────────────────────────────────
function DevicesSettings() {
  return (
    <div style={{ maxWidth: 520 }}>
      <Card>
        <p style={{ fontSize: 14, color: '#9C8E7E', margin: 0 }}>
          POS and KDS devices are registered automatically on first login using a device ID stored in localStorage.
          Manage active devices from the Devices page.
        </p>
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" onClick={() => window.location.href = '/admin/devices'}>
            Manage Devices →
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Integrations sub-page (placeholder) ─────────────────────────────────────
function IntegrationsSettings() {
  return (
    <div style={{ maxWidth: 520 }}>
      <Card>
        <p style={{ fontSize: 14, color: '#9C8E7E', margin: 0 }}>
          Configure Xero, Webhooks, and SMS integrations here.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => window.location.href = '/admin/webhooks'}>
            Webhooks →
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = '/admin/sms'}>
            SMS Campaigns →
          </Button>
        </div>
      </Card>
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
