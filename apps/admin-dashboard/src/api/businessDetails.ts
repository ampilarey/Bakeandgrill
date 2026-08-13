import { req } from './client';
import type { ScopeMismatch } from '../components/ScopeMismatchNotices';

export type BusinessDetailsField = {
  key: string;
  label: string;
  type: string;
  group: string;
  description?: string | null;
  value: string | null;
  default?: string | null;
  used_by?: string[];
};

export type BusinessDetailsSection = {
  id: string;
  title: string;
  description?: string | null;
  fields: BusinessDetailsField[];
};

export type BusinessDetailsHours = {
  source: string;
  editor_path: string;
  editor_label: string;
  weekly: Array<{ day: string; label: string }>;
  closures: Array<{ date: string; reason: string }>;
  open_now: boolean;
  ramadan_hours_active?: boolean;
  note: string;
};

export type BusinessDetailsLegal = {
  source: string;
  editor_path: string;
  editor_label: string;
  seller_name: string | null;
  seller_address: string | null;
  seller_tin: string | null;
  taxable_activity_no: string | null;
  gst_registered: boolean;
  receipt_name: string | null;
  receipt_phone: string | null;
  receipt_email: string | null;
  receipt_address: string | null;
  note: string;
};

export type BusinessDetailsResponse = {
  scope: 'shared';
  fields: BusinessDetailsField[];
  sections: BusinessDetailsSection[];
  hours: BusinessDetailsHours;
  legal: BusinessDetailsLegal;
  notice: string;
  mismatches?: ScopeMismatch[];
};

export function getBusinessDetails(): Promise<BusinessDetailsResponse> {
  return req('/admin/business-details');
}

export function updateBusinessDetails(
  changes: Array<{ key: string; value: string }>,
): Promise<BusinessDetailsResponse> {
  return req('/admin/business-details', {
    method: 'PUT',
    body: JSON.stringify({ changes }),
  });
}
