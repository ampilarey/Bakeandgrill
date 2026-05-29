export type ServiceChargePublicConfig = {
  enabled: boolean;
  label: string;
  type: 'percent' | 'fixed';
  value: number;
  apply_dine_in: boolean;
  apply_takeaway: boolean;
  apply_online_pickup: boolean;
  apply_delivery: boolean;
  taxable?: boolean;
};

export type ServiceChargePreview = {
  amountLaar: number;
  amount: number;
  label: string;
  enabled: boolean;
};

const APPLY_KEYS: Record<string, keyof ServiceChargePublicConfig> = {
  dine_in: 'apply_dine_in',
  takeaway: 'apply_takeaway',
  online_pickup: 'apply_online_pickup',
  delivery: 'apply_delivery',
};

export function parseServiceChargePublicSettings(
  settings: Record<string, string | null | undefined>,
): ServiceChargePublicConfig {
  const bool = (key: string, def: boolean) => {
    const v = settings[key];
    if (v === undefined || v === null) return def;
    return v === '1' || v === 'true';
  };
  const type = settings.service_charge_type === 'fixed' ? 'fixed' : 'percent';
  return {
    enabled: bool('service_charge_enabled', false),
    label: (settings.service_charge_label ?? 'Service charge').trim() || 'Service charge',
    type,
    value: parseFloat(String(settings.service_charge_value ?? '0')) || 0,
    apply_dine_in: bool('service_charge_apply_dine_in', true),
    apply_takeaway: bool('service_charge_apply_takeaway', false),
    apply_online_pickup: bool('service_charge_apply_online_pickup', false),
    apply_delivery: bool('service_charge_apply_delivery', false),
    taxable: bool('service_charge_taxable', true),
  };
}

export function previewServiceCharge(
  config: ServiceChargePublicConfig,
  orderType: string,
  discountedSubtotalLaar: number,
): ServiceChargePreview {
  if (!config.enabled || discountedSubtotalLaar <= 0) {
    return { amountLaar: 0, amount: 0, label: config.label, enabled: false };
  }
  const applyKey = APPLY_KEYS[orderType];
  if (!applyKey || !config[applyKey]) {
    return { amountLaar: 0, amount: 0, label: config.label, enabled: false };
  }
  let amountLaar = 0;
  if (config.type === 'percent') {
    const rateBp = Math.round(Math.min(config.value, 100) * 100);
    amountLaar = Math.round(discountedSubtotalLaar * rateBp / 10000);
  } else {
    amountLaar = Math.round(Math.min(config.value, 500) * 100);
  }
  amountLaar = Math.max(0, amountLaar);
  return {
    amountLaar,
    amount: Math.round(amountLaar) / 100,
    label: config.label,
    enabled: amountLaar > 0,
  };
}

export function serviceChargeTaxLaar(
  config: ServiceChargePublicConfig,
  serviceChargeLaar: number,
  weightedTaxRatePercent: number,
): number {
  if (!config.taxable || serviceChargeLaar <= 0 || weightedTaxRatePercent <= 0) return 0;
  return Math.round(serviceChargeLaar * weightedTaxRatePercent / 100);
}
