import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Truck, Receipt, ExternalLink } from 'lucide-react';

type RedirectLink = {
  icon: typeof ShoppingBag;
  label: string;
  desc: string;
  to: string;
  color: string;
  bg: string;
  border: string;
};

function RedirectLinks({ intro, links }: { intro: string; links: RedirectLink[] }) {
  const navigate = useNavigate();

  return (
    <div style={{ paddingTop: 24, maxWidth: 580 }}>
      <div style={{ marginBottom: 20, padding: '12px 16px', background: '#F0F9FF', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#0369A1', lineHeight: 1.6 }}>{intro}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {links.map(({ icon: Icon, label, desc, to, color, bg, border }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px', background: bg,
              border: `1.5px solid ${border}`, borderRadius: 14,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              transition: 'box-shadow 0.15s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
            onMouseOut={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', border: `1.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
              <Icon size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>{label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6B5D4F', lineHeight: 1.5 }}>{desc}</p>
            </div>
            <ExternalLink size={16} style={{ color: '#9C8E7E', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Website Settings → Ordering tab (packaging fees, seasonal presets, etc.) */
export function OrderingOpsRedirectPanel() {
  return (
    <RedirectLinks
      intro="Operational ordering settings (hours, fees, caps) live on Ordering Control — not in Website Settings. Use the links below."
      links={[
        {
          icon: ShoppingBag,
          label: 'Online Ordering',
          desc: 'Master switch, schedule, override, packaging fees, small-order fees, and Ramadan/Eid presets.',
          to: '/online-ordering',
          color: '#16A34A',
          bg: '#F0FDF4',
          border: 'rgba(22,163,74,0.2)',
        },
        {
          icon: Truck,
          label: 'Delivery & Zones',
          desc: 'Delivery switch, schedule, override, zone fees, and ops alerts.',
          to: '/delivery-settings',
          color: '#D4813A',
          bg: '#FFF7ED',
          border: 'rgba(212,129,58,0.2)',
        },
      ]}
    />
  );
}

/** Settings hub card + Website Settings → Online Ordering group */
export function OnlineOrderingRedirectPanel() {
  return (
    <RedirectLinks
      intro="Online ordering is managed on Ordering Control — master switch, schedule, override, packaging fees, and seasonal presets."
      links={[
        {
          icon: ShoppingBag,
          label: 'Open Ordering Control',
          desc: 'Go to Online Ordering with live status, schedule editor, and fee settings.',
          to: '/online-ordering',
          color: '#16A34A',
          bg: '#F0FDF4',
          border: 'rgba(22,163,74,0.2)',
        },
      ]}
    />
  );
}

/** Settings hub card + Website Settings → Delivery group */
export function DeliveryRedirectPanel() {
  return (
    <RedirectLinks
      intro="Delivery availability, zone fees, and overrides are managed on Delivery & Zones — not here."
      links={[
        {
          icon: Truck,
          label: 'Open Delivery & Zones',
          desc: 'Delivery switch, schedule, force-open override, zone fees, and delay alerts.',
          to: '/delivery-settings',
          color: '#D4813A',
          bg: '#FFF7ED',
          border: 'rgba(212,129,58,0.2)',
        },
      ]}
    />
  );
}

/** Website Settings → Charges group */
export function ServiceChargeRedirectPanel() {
  const navigate = useNavigate();

  return (
    <div style={{ paddingTop: 24, maxWidth: 580 }}>
      <div style={{ marginBottom: 20, padding: '12px 16px', background: '#F0F9FF', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#0369A1', lineHeight: 1.6 }}>
          Service charge is configured in Settings → Ordering &amp; Charges. Do not edit raw charge keys here — changes may not apply correctly.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/settings?tab=ordering-charges')}
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '16px 20px', background: '#FFFBEB',
          border: '1.5px solid rgba(212,129,58,0.25)', borderRadius: 14,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', border: '1.5px solid rgba(212,129,58,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#D4813A' }}>
          <Receipt size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1C1408' }}>Ordering &amp; Charges</p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6B5D4F', lineHeight: 1.5 }}>
            Service charge rate, label, and which order types it applies to.
          </p>
        </div>
        <ExternalLink size={16} style={{ color: '#9C8E7E', flexShrink: 0 }} />
      </button>
    </div>
  );
}

/** Website Settings tabs that must not expose raw ops keys */
export function WebsiteOpsRedirectForGroup({ groupKey }: { groupKey: string }) {
  switch (groupKey) {
    case 'ordering':
      return <OrderingOpsRedirectPanel />;
    case 'online ordering':
      return <OnlineOrderingRedirectPanel />;
    case 'delivery':
      return <DeliveryRedirectPanel />;
    case 'charges':
      return <ServiceChargeRedirectPanel />;
    default:
      return null;
  }
}

export function isWebsiteOpsGroup(groupKey: string): boolean {
  return ['ordering', 'online ordering', 'delivery', 'charges'].includes(groupKey);
}
