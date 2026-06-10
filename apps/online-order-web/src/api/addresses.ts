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

export async function fetchCustomerAddresses(): Promise<{ addresses: CustomerAddress[] }> {
  return request<{ addresses: CustomerAddress[] }>(ENDPOINTS.CUSTOMER_ADDRESSES);
}

export async function createCustomerAddress(
  data: CustomerAddressInput,
): Promise<{ address: CustomerAddress }> {
  return request<{ address: CustomerAddress }>(ENDPOINTS.CUSTOMER_ADDRESSES, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomerAddress(
  id: number,
  data: Partial<CustomerAddressInput>,
): Promise<{ address: CustomerAddress }> {
  return request<{ address: CustomerAddress }>(ENDPOINTS.CUSTOMER_ADDRESS_BY_ID(id), {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomerAddress(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(ENDPOINTS.CUSTOMER_ADDRESS_BY_ID(id), {
    method: 'DELETE',
  });
}

export async function setDefaultCustomerAddress(
  id: number,
): Promise<{ address: CustomerAddress }> {
  return request<{ address: CustomerAddress }>(ENDPOINTS.CUSTOMER_ADDRESS_DEFAULT(id), {
    method: 'POST',
  });
}
