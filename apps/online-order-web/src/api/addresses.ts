import { ENDPOINTS } from '@shared/api';
import { request } from './client';

export type CustomerAddress = {
  id: number;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes: string | null;
  location_link: string | null;
  is_default: boolean;
};

export type CustomerAddressInput = {
  label?: string;
  address_line1: string;
  address_line2?: string;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes?: string;
  location_link?: string;
  is_default?: boolean;
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchCustomerAddresses(token: string): Promise<{ addresses: CustomerAddress[] }> {
  return request<{ addresses: CustomerAddress[] }>(ENDPOINTS.CUSTOMER_ADDRESSES, {
    headers: authHeaders(token),
  });
}

export async function createCustomerAddress(
  token: string,
  data: CustomerAddressInput,
): Promise<{ address: CustomerAddress }> {
  return request<{ address: CustomerAddress }>(ENDPOINTS.CUSTOMER_ADDRESSES, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function updateCustomerAddress(
  token: string,
  id: number,
  data: Partial<CustomerAddressInput>,
): Promise<{ address: CustomerAddress }> {
  return request<{ address: CustomerAddress }>(ENDPOINTS.CUSTOMER_ADDRESS_BY_ID(id), {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
}

export async function deleteCustomerAddress(token: string, id: number): Promise<{ message: string }> {
  return request<{ message: string }>(ENDPOINTS.CUSTOMER_ADDRESS_BY_ID(id), {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export async function setDefaultCustomerAddress(
  token: string,
  id: number,
): Promise<{ address: CustomerAddress }> {
  return request<{ address: CustomerAddress }>(ENDPOINTS.CUSTOMER_ADDRESS_DEFAULT(id), {
    method: 'POST',
    headers: authHeaders(token),
  });
}
