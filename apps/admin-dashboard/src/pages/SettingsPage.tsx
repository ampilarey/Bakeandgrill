import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WebsiteSettings } from './SettingsPage/WebsiteSettingsSubPage';
import { PermissionsSettings } from './SettingsPage/PermissionsSettingsSubPage';
import {
  getSiteSettings, updateSiteSettings,
  fetchSmsTemplates,
  type SmsTemplate,
} from '../api';
import { SmsNotificationRow } from './SettingsPage/SmsNotificationRow';
import { PageHeader, PageShell } from '../components/SharedUI';

/** Legacy ?tab= values from before hub cleanup — redirect to sidebar routes */
const LEGACY_TAB_REDIRECTS: Record<string, string> = {
  ordering: '/online-ordering',
  delivery: '/delivery-settings',
  'ordering-charges': '/online-ordering?section=fees',
};

/** Settings sub-pages now live in the System section rail (no separate hub cards). */
const SETTINGS_TABS = [
  { id: 'website',       label: 'Website Settings',      desc: 'Moved to Website / Order App Content editors' },
  { id: 'permissions',   label: 'Roles & Permissions',   desc: 'Manage role defaults and per-user overrides' },
  { id: 'notifications', label: 'Notifications',         desc: 'Customer SMS alerts for order status changes' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

function isSettingsTab(v: string | null): v is SettingsTabId {
  return !!v && SETTINGS_TABS.some((t) => t.id === v);
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([getSiteSettings(), fetchSmsTemplates()])
      .then(([settingsRes, templatesRes]) => {
        const map: Record<string, string> = {};
        Object.values(settingsRes.settings ?? {}).forEach((group) => {
          (group as { key: string; value: string | null }[]).forEach((s) => {
            if (s.value !== null) map[s.key] = s.value;
          });
        });
        setSettings(map);
        setTemplates(templatesRes.templates.filter((t) => t.type === 'customer_notification'));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

      <div style={{ padding: '12px 16px', background: '#FFF7ED', border: '1px solid rgba(212,129,58,0.3)', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Staff SMS templates (new order alerts, shift reminders, etc.) are under{' '}
          <strong>SMS → Templates</strong> and <strong>SMS → Automations</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const userParam = searchParams.get('user');
  const initialUserId = userParam ? Number(userParam) : null;

  useEffect(() => {
    document.title = 'Settings — Bake & Grill Admin';
  }, []);

  useEffect(() => {
    if (tabParam && LEGACY_TAB_REDIRECTS[tabParam]) {
      navigate(LEGACY_TAB_REDIRECTS[tabParam], { replace: true });
      return;
    }
    // Bare /settings or unknown tabs → Roles & Permissions (rail default)
    if (!tabParam || tabParam === 'integrations' || !isSettingsTab(tabParam)) {
      navigate('/settings?tab=permissions', { replace: true });
    }
  }, [tabParam, navigate]);

  const active: SettingsTabId = isSettingsTab(tabParam) ? tabParam : 'permissions';
  const card = SETTINGS_TABS.find((c) => c.id === active) ?? SETTINGS_TABS[1];

  // Avoid flash while redirecting legacy/bare URLs
  if (!isSettingsTab(tabParam)) {
    return null;
  }

  return (
    <PageShell>
      <PageHeader
        section="System"
        title={card.label}
        subtitle={card.desc}
      />

      {active === 'website' && <WebsiteSettings />}
      {active === 'permissions' && (
        <PermissionsSettings initialUserId={Number.isFinite(initialUserId) ? initialUserId : null} />
      )}
      {active === 'notifications' && <NotificationsSettings />}
    </PageShell>
  );
}
