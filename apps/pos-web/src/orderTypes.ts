export const POS_ORDER_TYPES = ["Dine-in", "Takeaway", "Pickup", "Delivery"] as const;
export type PosOrderType = (typeof POS_ORDER_TYPES)[number];

export type PosDeliveryDetails = {
  addressLine1: string;
  addressLine2: string;
  island: string;
  contactName: string;
  contactPhone: string;
  notes: string;
};

export const EMPTY_DELIVERY_DETAILS: PosDeliveryDetails = {
  addressLine1: "",
  addressLine2: "",
  island: "Male",
  contactName: "",
  contactPhone: "",
  notes: "",
};

/** Rough estimate for Charge screen — server calculates the authoritative fee. */
export function estimateDeliveryFeeMvr(island: string, subtotalMvr: number): number {
  const threshold = 200;
  if (subtotalMvr >= threshold) return 0;
  const key = island.trim().toLowerCase();
  const zones: Record<string, number> = { male: 30, hulhumale: 30, "hulhumalé": 30 };
  return zones[key] ?? 30;
}

export function normalizeMvPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("960") && digits.length === 10) return `+${digits}`;
  if (digits.length === 7) return `+960${digits}`;
  return phone.trim();
}

export function validateDeliveryDetails(d: PosDeliveryDetails): string | null {
  if (!d.addressLine1.trim()) return "Enter the delivery address.";
  if (!d.island.trim()) return "Enter the delivery island/area.";
  if (!d.contactName.trim()) return "Enter the contact name.";
  if (!d.contactPhone.trim()) return "Enter the contact phone.";
  const normalized = normalizeMvPhone(d.contactPhone);
  if (!/^(\+?960)?[379]\d{6}$/.test(normalized.replace(/\s/g, ""))) {
    return "Enter a valid 7-digit Maldivian mobile number.";
  }
  return null;
}
