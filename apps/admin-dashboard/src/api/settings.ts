import { req } from './client';

// ── Site Settings ─────────────────────────────────────────────────────────────

export interface SiteSettingsGroup {
  [group: string]: { key: string; value: string | null; type: string; label: string; description: string | null }[];
}

export async function getSiteSettings(): Promise<{ settings: SiteSettingsGroup }> {
  return req('/site-settings');
}

export async function updateSiteSettings(settings: Record<string, string | null>): Promise<void> {
  await req('/site-settings', { method: 'PUT', body: JSON.stringify({ settings }) });
}

export async function uploadSiteLogo(key: string, file: File): Promise<{ url: string }> {
  const { prepareImageForUpload } = await import('../utils/prepareUpload');
  const prepared = await prepareImageForUpload(file);
  const form = new FormData();
  form.append('file', prepared);
  form.append('key', key);
  return req('/site-settings/upload', { method: 'POST', body: form });
}

// ── Online Ordering Gate ───────────────────────────────────────────────────────

export type ModeGateFragment = {
  enabled: boolean;
  open: boolean;
};

export interface OnlineOrderingGateStatus {
  open: boolean;
  message: string;
  reason: string | null;
  master_switch: boolean;
  override_until: string | null;
  override_active: boolean;
  schedule_active: boolean;
  current_close: string | null;
  next_open_window: string | null;
  /** Online open AND delivery gate open. */
  delivery_available?: boolean;
  next_delivery_window?: string | null;
  /** Present when order-for-tomorrow is configured. */
  order_for_tomorrow?: {
    cutoff: string;
    collect_tomorrow_date: string;
    enabled?: boolean;
    open?: boolean;
    modes?: {
      pickup?: ModeGateFragment;
      delivery?: ModeGateFragment;
      dine_in?: ModeGateFragment;
    };
  };
  /** Prepaid dine-in ("Eat here") availability. */
  dine_in_preorder?: {
    enabled: boolean;
    open?: boolean;
  };
  reservations?: { open: boolean };
  gift_cards?: { open: boolean };
  /** Per-mode today gates (additive). */
  modes?: {
    pickup?: ModeGateFragment;
    delivery?: ModeGateFragment;
    dine_in?: ModeGateFragment;
  };
}

export async function getOnlineOrderingStatus(): Promise<OnlineOrderingGateStatus> {
  return req('/ordering/status');
}

export async function toggleOnlineOrdering(enabled: boolean): Promise<{ online_ordering_enabled: boolean; status: OnlineOrderingGateStatus }> {
  return req('/admin/ordering/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setOnlineOrderingOverride(until: string | null): Promise<{ override_until: string | null }> {
  return req('/admin/ordering/override', { method: 'POST', body: JSON.stringify({ override_until: until }) });
}

export interface OnlineOrderingDayWindow {
  enabled: boolean;
  windows: { open: string; close: string }[];
}

export async function updateOnlineOrderingSchedule(
  schedule: Record<string, OnlineOrderingDayWindow> | null,
): Promise<{ online_ordering_schedule: unknown; status: OnlineOrderingGateStatus }> {
  return req('/admin/ordering/schedule', { method: 'PUT', body: JSON.stringify({ schedule }) });
}

/** Owner cutoff: after this HH:mm, “tomorrow” means the day after. */
export async function updateOrderForTomorrowCutoff(
  cutoff: string,
): Promise<{ order_for_tomorrow_cutoff: string; status: OnlineOrderingGateStatus }> {
  return req('/admin/ordering/tomorrow-cutoff', { method: 'PUT', body: JSON.stringify({ cutoff }) });
}

// ── Feature gates (kill switch + schedule + override per feature) ────────────

export interface FeatureGateStatus {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Effective right now (enabled + schedule + override). */
  open: boolean;
  schedule: Record<string, { open?: string; close?: string; enabled?: boolean; windows?: { open: string; close: string }[] }> | null;
  override_until: string | null;
}

export async function getFeatureGates(): Promise<{ gates: Record<string, FeatureGateStatus> }> {
  return req('/admin/ordering/feature-gates');
}

export async function updateFeatureGate(
  key: string,
  patch: {
    enabled?: boolean;
    schedule?: Record<
      string,
      | { open: string; close: string; enabled?: boolean }
      | { enabled?: boolean; windows: { open: string; close: string }[] }
    > | null;
    override_until?: string | null;
  },
): Promise<{ gate: FeatureGateStatus }> {
  return req(`/admin/ordering/feature-gates/${key}`, { method: 'PUT', body: JSON.stringify(patch) });
}

// ── Pre-order / catering gate ─────────────────────────────────────────────────

export type CateringOrderingGateStatus = OnlineOrderingGateStatus;

export async function getCateringOrderingStatus(): Promise<CateringOrderingGateStatus> {
  return req('/ordering/catering-status');
}

export async function toggleCateringOrdering(enabled: boolean): Promise<{ catering_ordering_enabled: boolean; status: CateringOrderingGateStatus }> {
  return req('/admin/ordering/catering-toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setCateringOrderingOverride(until: string | null): Promise<{ override_until: string | null; status: CateringOrderingGateStatus }> {
  return req('/admin/ordering/catering-override', { method: 'POST', body: JSON.stringify({ override_until: until }) });
}

export async function updateCateringOrderingSchedule(
  schedule: Record<string, OnlineOrderingDayWindow> | null,
): Promise<{ catering_ordering_schedule: unknown; status: CateringOrderingGateStatus }> {
  return req('/admin/ordering/catering-schedule', { method: 'PUT', body: JSON.stringify({ schedule }) });
}

// ── Delivery Gate ─────────────────────────────────────────────────────────────

export interface DeliveryGateStatus {
  delivery_open: boolean;
  message: string | null;
  accepting_flag: boolean;
  schedule_active: boolean;
  delivery_schedule?: Record<string, unknown> | null;
  next_delivery_window: string | null;
  override_active: boolean;
  override_until: string | null;
  max_active_orders?: number;
  active_delivery_orders?: number;
  capacity_enforced?: boolean;
  zones_enforced?: boolean;
}

export async function getDeliveryStatus(): Promise<DeliveryGateStatus> {
  return req('/ordering/delivery-status');
}

export async function toggleDelivery(enabled: boolean): Promise<{ delivery_accepting_orders: boolean; delivery_status: DeliveryGateStatus }> {
  return req('/admin/ordering/delivery-toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export interface DeliveryDayWindow {
  enabled: boolean;
  windows: { open: string; close: string }[];
}

export async function updateDeliverySchedule(
  schedule: Record<string, DeliveryDayWindow> | null,
): Promise<{ delivery_schedule: unknown; delivery_status: DeliveryGateStatus }> {
  return req('/admin/ordering/delivery-schedule', { method: 'PUT', body: JSON.stringify({ schedule }) });
}

export async function setDeliveryOverride(until: string | null): Promise<{ override_until: string | null; delivery_status: DeliveryGateStatus }> {
  return req('/admin/ordering/delivery-override', { method: 'POST', body: JSON.stringify({ override_until: until }) });
}

export async function updateDeliveryCapacity(
  maxActiveOrders: number,
): Promise<{ max_active_orders: number; delivery_status: DeliveryGateStatus }> {
  return req('/admin/ordering/delivery-capacity', {
    method: 'POST',
    body: JSON.stringify({ max_active_orders: maxActiveOrders }),
  });
}

export interface DeliveryFeeSettings {
  default_fee: number;
  free_threshold: number;
  /** Customer-facing delivery promise, e.g. "30–45 min". */
  delivery_time: string;
  zone_fees: Record<string, number>;
  zone_whitelist: string[] | null;
  zones_enforced: boolean;
  source: 'database' | 'config';
}

export async function getDeliveryFeeSettings(): Promise<{ settings: DeliveryFeeSettings; delivery_status: DeliveryGateStatus }> {
  return req('/admin/delivery/settings');
}

export async function updateDeliveryFeeSettings(payload: {
  default_fee: number;
  free_threshold: number;
  delivery_time?: string;
  zone_fees: Record<string, number>;
  restrict_to_zone_fees?: boolean;
  zone_whitelist?: string[] | null;
}): Promise<{ message: string; settings: DeliveryFeeSettings; delivery_status: DeliveryGateStatus }> {
  return req('/admin/delivery/settings', { method: 'PATCH', body: JSON.stringify(payload) });
}

// ── Service Charge ────────────────────────────────────────────────────────────

export type ServiceChargeSettings = {
  enabled: boolean;
  label: string;
  type: 'percent' | 'fixed';
  value: number;
  apply_dine_in: boolean;
  apply_takeaway: boolean;
  apply_online_pickup: boolean;
  apply_delivery: boolean;
  taxable: boolean;
  show_on_receipts: boolean;
};

export async function getServiceChargeSettings(): Promise<{ settings: ServiceChargeSettings }> {
  return req('/admin/settings/service-charge');
}

export async function updateServiceChargeSettings(
  settings: ServiceChargeSettings,
): Promise<{ message: string; settings: ServiceChargeSettings }> {
  return req('/admin/settings/service-charge', { method: 'PUT', body: JSON.stringify(settings) });
}

// ── Payment commission (BML / card processing fees) ─────────────────────────

export type PaymentCommissionSettings = {
  enabled: boolean;
  pos_card_rate_bp: number;
  online_gateway_rate_bp: number;
  pos_card_rate_percent: number;
  online_gateway_rate_percent: number;
};

export async function getPaymentCommissionSettings(): Promise<{ settings: PaymentCommissionSettings }> {
  return req('/admin/settings/payment-commission');
}

export async function updatePaymentCommissionSettings(payload: {
  enabled: boolean;
  pos_card_rate_bp: number;
  online_gateway_rate_bp: number;
}): Promise<{ message: string; settings: PaymentCommissionSettings }> {
  return req('/admin/settings/payment-commission', { method: 'PUT', body: JSON.stringify(payload) });
}

// ── Packaging fee & ordering caps ─────────────────────────────────────────────

export type PackagingFeeSettings = {
  packaging_label: string;
  small_order_enabled: boolean;
  small_order_threshold_mvr: number;
  small_order_amount_mvr: number;
  ordering_max_per_15min: number;
};

export async function getPackagingFeeSettings(): Promise<{ settings: PackagingFeeSettings }> {
  return req('/admin/settings/packaging-fee');
}

export async function updatePackagingFeeSettings(
  settings: PackagingFeeSettings,
): Promise<{ message: string; settings: PackagingFeeSettings }> {
  return req('/admin/settings/packaging-fee', { method: 'PUT', body: JSON.stringify(settings) });
}

export type OpsAlertsSettings = {
  delivery_delay_alert_sms: boolean;
  inventory_reorder_alert_sms: boolean;
};

export async function getOpsAlertsSettings(): Promise<{ settings: OpsAlertsSettings }> {
  return req('/admin/ops/alerts');
}

export async function updateOpsAlertsSettings(
  data: Partial<OpsAlertsSettings>,
): Promise<{ settings: OpsAlertsSettings; message: string }> {
  return req('/admin/ops/alerts', { method: 'PATCH', body: JSON.stringify(data) });
}

// ── Permissions ───────────────────────────────────────────────────────────────

export interface PermissionItem {
  slug: string;
  name: string;
  group: string;
  granted: boolean;
  role_default?: boolean;
  override_mode?: 'inherit' | 'allow' | 'deny';
  source: 'owner' | 'role' | 'override';
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export type WebhookSubscription = {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  disabled_at: string | null;
  created_at: string;
};

export type WebhookLog = {
  id: number;
  url: string;
  event: string;
  response_code: number | null;
  status: 'delivered' | 'failed';
  created_at: string;
};

export async function fetchWebhooks(): Promise<{ subscriptions: WebhookSubscription[] }> {
  return req('/webhooks');
}

export async function createWebhook(data: { name: string; url: string; events: string[] }): Promise<{ subscription: WebhookSubscription }> {
  return req('/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(id: number, data: Partial<{ name: string; url: string; events: string[]; active: boolean }>): Promise<{ subscription: WebhookSubscription }> {
  return req(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: number): Promise<void> {
  await req(`/webhooks/${id}`, { method: 'DELETE' });
}

export async function rotateWebhookSecret(id: number): Promise<{ secret: string }> {
  return req(`/webhooks/${id}/rotate-secret`, { method: 'POST' });
}

export async function fetchWebhookLogs(id: number): Promise<{ data: WebhookLog[]; total: number }> {
  return req(`/webhooks/${id}/logs`);
}

export async function fetchSupportedWebhookEvents(): Promise<{ events: string[] }> {
  return req('/webhooks/events');
}

export async function getWebhook(id: number): Promise<{ subscription: WebhookSubscription }> {
  return req(`/webhooks/${id}`);
}
