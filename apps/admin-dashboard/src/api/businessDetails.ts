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
};

export type BusinessDetailsResponse = {
  scope: 'shared';
  fields: BusinessDetailsField[];
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
