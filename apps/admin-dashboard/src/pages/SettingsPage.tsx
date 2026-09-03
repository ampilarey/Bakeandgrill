import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';
import { ServiceChargeSettings } from './SettingsPage/ServiceChargeSettings';
import { PaymentCommissionSettings } from './SettingsPage/PaymentCommissionSettings';
import { CreditAccountSettings } from './SettingsPage/CreditAccountSettings';
import { CurrencyPhotosSettings } from './SettingsPage/CurrencyPhotosSubPage';
import { StockSettings } from './SettingsPage/StockSettings';
import {
  getSiteSettings, updateSiteSettings,
  fetchSmsTemplates,
  getOpsAlertsSettings,
  updateOpsAlertsSettings,
  type SmsTemplate,
  type OpsAlertsSettings,
} from '../api';
import { SmsNotificationRow } from './SettingsPage/SmsNotificationRow';
import { PageHeader, PageShell } from '../components/SharedUI';

/** Legacy ?tab= values from before hub cleanup — redirect to sidebar routes */
const LEGACY_TAB_REDIRECTS: Record<string, string> = {
  ordering: '/online-ordering',
  delivery: '/delivery-settings',
  'ordering-charges': '/settings/charges',
  website: '/content/website',
  permissions: '/settings/permissions',
  notifications: '/settings/notifications',
  charges: '/settings/charges',
};

/** Settings sub-pages now live in the System section rail (no separate hub cards). */
const SETTINGS_TABS = [
  { id: 'permissions',   label: 'Roles & Permissions',   desc: 'Manage role defaults and per-user overrides' },
  { id: 'notifications', label: 'Notifications',         desc: 'Customer SMS alerts for order status changes' },
  { id: 'charges',       label: 'Charges & Fees',        desc: 'Service charge and payment commission' },
  { id: 'credit',        label: 'Credit Accounts',       desc: 'Approval ceiling, payment terms, and whether credit is open' },
  { id: 'stock',         label: 'Stock Corrections',     desc: 'How big a stock difference has to be before it says why' },
  { id: 'currency',      label: 'Currency Photos',       desc: 'Note & coin photos shown on the POS cash count' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

function isSettingsTab(v: string | null): v is SettingsTabId {
  return !!v && SETTINGS_TABS.some((t) => t.id === v);
}

/** Path segment after /settings/ — e.g. /settings/permissions → permissions */
function settingsPathTab(pathname: string): string | null {
  const match = pathname.match(/^\/settings\/([^/?#]+)/);
  return match?.[1] ?? null;
}

// ─── Notifications sub-page ──────────────────────────────────────────────────
type NotifConfig = {
  key: string;
  label: string;
  desc: string;
  emoji: string;
  templateSlugs?: string[];
  templateLabels?: string[];
};

const PAYMENT_SMS_CONFIG: NotifConfig[] = [
  {
    key: 'sms_customer_payment_confirmed_enabled',
    label: 'Payment Received (Receipt SMS)',
    desc: 'Automatic receipt link when payment is confirmed (POS charge and online BML).',
    emoji: '🎉',
    templateSlugs: ['customer_payment_confirmed_pos', 'customer_payment_confirmed_online'],
    templateLabels: ['Counter orders (dine-in / takeaway)', 'Online pickup / delivery'],
  },
  {
    key: 'sms_customer_completion_receipt_enabled',
    label: 'Order Completed / Delivered (Receipt SMS)',
    desc: 'Receipt link when an online pickup or delivery order is completed.',
    emoji: '📄',
    templateSlugs: ['customer_completion_receipt'],
  },
];

const POS_SMS_CONFIG: NotifConfig[] = [
  {
    key: 'sms_pos_send_bill_enabled',
    label: 'Send Bill',
    desc: 'Cashier sends a pre-payment bill link by SMS from the POS.',
    emoji: '🧾',
    templateSlugs: ['customer_send_bill'],
  },
  {
    key: 'sms_pos_send_pay_link_enabled',
    label: 'Send Pay Link',
    desc: 'Cashier sends a BML pay-page link by SMS from the POS.',
    emoji: '🔗',
    templateSlugs: ['customer_send_pay_link'],
  },
  {
    key: 'sms_pos_fire_to_kitchen_enabled',
    label: 'Fire to Kitchen',
    desc: '“Order received” SMS when a phone pickup order is fired from the POS.',
    emoji: '🔥',
    templateSlugs: ['customer_fire_to_kitchen'],
  },
  {
    key: 'sms_pos_receipt_resend_enabled',
    label: 'Receipt Resend',
    desc: 'Manual receipt SMS resend from the POS post-charge banner or receipts pane.',
    emoji: '📱',
    templateSlugs: ['customer_receipt_resend'],
  },
];

const LIFECYCLE_SMS_CONFIG: NotifConfig[] = [
  {
    key: 'sms_customer_preparing_enabled',
    label: 'Order Preparing',
    desc: 'SMS when the kitchen starts preparing an online pickup or delivery order.',
    emoji: '🍳',
    templateSlugs: ['customer_order_preparing'],
  },
  {
    key: 'sms_customer_ready_enabled',
    label: 'Order Ready / Packed',
    desc: 'SMS when an order is ready for pickup or packed for delivery.',
    emoji: '✅',
    templateSlugs: ['customer_order_ready_pickup', 'customer_order_ready_delivery'],
    templateLabels: ['Pickup ready', 'Delivery packed'],
  },
  {
    key: 'sms_customer_on_the_way_enabled',
    label: 'Out for Delivery',
    desc: 'SMS when a delivery order is on the way.',
    emoji: '🛵',
    templateSlugs: ['customer_order_on_the_way'],
  },
];

function NotificationsSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [opsAlerts, setOpsAlerts] = useState<OpsAlertsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [opsSaving, setOpsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([getSiteSettings(), fetchSmsTemplates(), getOpsAlertsSettings()])
      .then(([settingsRes, templatesRes, opsRes]) => {
        const map: Record<string, string> = {};
        Object.values(settingsRes.settings ?? {}).forEach((group) => {
          (group as { key: string; value: string | null }[]).forEach((s) => {
            if (s.value !== null) map[s.key] = s.value;
          });
        });
        setSettings(map);
        setTemplates(templatesRes.templates.filter((t) => t.type === 'customer_notification'));
        setOpsAlerts(opsRes.settings);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleInventoryReorderAlert = async () => {
    if (!opsAlerts || opsSaving) return;
    setOpsSaving(true);
    setError('');
    try {
      const res = await updateOpsAlertsSettings({
        inventory_reorder_alert_sms: !opsAlerts.inventory_reorder_alert_sms,
      });
      setOpsAlerts(res.settings);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setOpsSaving(false);
    }
  };

  const templateBySlug = (slug: string) => templates.find((t) => t.slug === slug) ?? null;

  const isEnabled = (key: string) => {
    const v = settings[key];
    return v === undefined || v === 'true' || v === '1';
  };

  const toggle = async (key: string) => {
    const newVal = isEnabled(key) ? 'false' : 'true';
    setSaving(key);
    setError('');
    try {
      await updateSiteSettings({ [key]: newVal });
      setSettings((s) => ({ ...s, [key]: newVal }));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const handleTemplateSaved = (updated: SmsTemplate) => {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const renderConfigRows = (configs: NotifConfig[]) => (
    configs.flatMap((cfg) => {
      const slugs = cfg.templateSlugs ?? [];
      if (slugs.length === 0) {
        return [(
          <SmsNotificationRow
            key={cfg.key}
            toggleKey={cfg.key}
            label={cfg.label}
            desc={cfg.desc}
            emoji={cfg.emoji}
            enabled={isEnabled(cfg.key)}
            savingToggle={saving === cfg.key}
            onToggle={() => void toggle(cfg.key)}
          />
        )];
      }
      return slugs.map((slug, idx) => (
        <SmsNotificationRow
          key={`${cfg.key}-${slug}`}
          toggleKey={cfg.key}
          label={cfg.label}
          desc={cfg.desc}
          emoji={cfg.emoji}
          enabled={isEnabled(cfg.key)}
          toggleDisabled={idx > 0}
          savingToggle={saving === cfg.key}
          onToggle={() => void toggle(cfg.key)}
          template={templateBySlug(slug)}
          templateLabel={cfg.templateLabels?.[idx]}
          onTemplateSaved={handleTemplateSaved}
        />
      ));
    })
  );

  const renderSection = (title: string, subtitle: string, configs: NotifConfig[]) => (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3D2B1F', margin: '0 0 4px' }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 14px' }}>{subtitle}</p>
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {renderConfigRows(configs)}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {renderSection(
        'Payment & Receipt SMS',
        'Automatic customer SMS when payment is received or an online order completes.',
        PAYMENT_SMS_CONFIG,
      )}

      {renderSection(
        'POS Cashier Actions',
        'SMS triggered by cashier buttons in the POS app. When disabled, the POS shows an error if tapped.',
        POS_SMS_CONFIG,
      )}

      {renderSection(
        'Order Lifecycle SMS',
        'Status-change SMS for online pickup and delivery orders (including when marked ready from the POS).',
        LIFECYCLE_SMS_CONFIG,
      )}

      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3D2B1F', margin: '0 0 4px' }}>Staff alerts</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
          Internal SMS for ops — not customer order status messages.
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 44,
            padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border)',
            background: 'var(--color-surface)', cursor: 'pointer',
          }}>
            <button
              type="button"
              role="switch"
              aria-checked={opsAlerts?.inventory_reorder_alert_sms ?? false}
              aria-label="Inventory reorder SMS alert"
              disabled={opsSaving || !opsAlerts}
              onClick={(e) => {
                e.preventDefault();
                void toggleInventoryReorderAlert();
              }}
              style={{
                flexShrink: 0,
                width: 44,
                height: 26,
                borderRadius: 999,
                border: 'none',
                padding: 2,
                marginTop: 2,
                cursor: opsSaving || !opsAlerts ? 'not-allowed' : 'pointer',
                background: opsAlerts?.inventory_reorder_alert_sms ? 'var(--color-accent)' : '#D4C4B5',
                transition: 'background 0.15s',
              }}
            >
              <span style={{
                display: 'block',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#fff',
                transform: opsAlerts?.inventory_reorder_alert_sms ? 'translateX(18px)' : 'translateX(0)',
                transition: 'transform 0.15s',
              }} />
            </button>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#3D2B1F' }}>
                Inventory reorder SMS
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.45 }}>
                Daily digest to owners/managers when inventory hits reorder point (skips snoozed SKUs).
                Falls back to business phone if staff have no phone.
              </span>
            </span>
          </label>
        )}
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--color-warning-bg)', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Staff SMS templates (new order alerts, shift reminders, etc.) are under{' '}
          <strong>SMS → Templates</strong> and <strong>SMS → Automations</strong>.
          Delivery-delay SMS stays on Ordering Control → Delivery.
        </p>
      </div>
    </div>
  );
}

function ChargesSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <ServiceChargeSettings />
      <PaymentCommissionSettings />
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const pathTab = settingsPathTab(pathname);
  const userParam = searchParams.get('user');
  const initialUserId = userParam ? Number(userParam) : null;

  useEffect(() => {
    document.title = 'Settings — Bake & Grill Admin';
  }, []);

  useEffect(() => {
    if (tabParam && LEGACY_TAB_REDIRECTS[tabParam]) {
      const target = LEGACY_TAB_REDIRECTS[tabParam];
      // Preserve ?user= when bouncing permissions query → path
      if (tabParam === 'permissions' && userParam) {
        navigate(`${target}?user=${userParam}`, { replace: true });
        return;
      }
      navigate(target, { replace: true });
      return;
    }
    // Bare /settings or unknown path segments → Roles & Permissions
    if (!isSettingsTab(pathTab)) {
      const qs = userParam ? `?user=${userParam}` : '';
      navigate(`/settings/permissions${qs}`, { replace: true });
    }
  }, [tabParam, pathTab, userParam, navigate]);

  const active: SettingsTabId = isSettingsTab(pathTab) ? pathTab : 'permissions';
  const card = SETTINGS_TABS.find((c) => c.id === active) ?? SETTINGS_TABS[0];

  // Avoid flash while redirecting legacy/bare URLs
  if (!isSettingsTab(pathTab) || tabParam) {
    return null;
  }

  return (
    <PageShell>
      <PageHeader
        section="System"
        title={card.label}
        subtitle={card.desc}
      />

      {active === 'permissions' && (
        <PermissionsSettings initialUserId={Number.isFinite(initialUserId) ? initialUserId : null} />
      )}
      {active === 'notifications' && <NotificationsSettings />}
      {active === 'charges' && <ChargesSettings />}
      {active === 'credit' && <CreditAccountSettings />}
      {active === 'stock' && <StockSettings />}
      {active === 'currency' && <CurrencyPhotosSettings />}
    </PageShell>
  );
}
