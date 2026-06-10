import { useEffect, useState } from 'react';
import {
  fetchCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
} from '../../api';
import type { AuthCustomer, CustomerAddress } from '../../api';

const emptyAddressForm = {
  label: '', address_line1: '', address_line2: '', island: 'Male',
  contact_name: '', contact_phone: '', notes: '', location_link: '', is_default: false,
};

export function useAccountAddresses(
  isAuthenticated: boolean,
  authReady: boolean,
  activeTab: string,
  customer: AuthCustomer | null,
  customerName: string | null,
) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState('');
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [addressForm, setAddressForm] = useState(emptyAddressForm);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressMsg, setAddressMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'addresses' || addressesLoaded) return;
    setAddressesLoading(true);
    fetchCustomerAddresses()
      .then((res) => setAddresses(res.addresses ?? []))
      .catch((e: Error) => setAddressesError(e.message || 'Failed to load addresses.'))
      .finally(() => {
        setAddressesLoading(false);
        setAddressesLoaded(true);
      });
  }, [isAuthenticated, authReady, activeTab, addressesLoaded]);

  const reloadAddresses = () => {
    if (!isAuthenticated) return;
    setAddressesLoading(true);
    fetchCustomerAddresses()
      .then((res) => setAddresses(res.addresses ?? []))
      .catch((e: Error) => setAddressesError(e.message || 'Failed to load addresses.'))
      .finally(() => setAddressesLoading(false));
  };

  const startAddAddress = () => {
    setEditingAddressId(null);
    setAddressForm({
      label: customer?.name ? 'Home' : '',
      address_line1: '',
      address_line2: '',
      island: 'Male',
      contact_name: customer?.name ?? customerName ?? '',
      contact_phone: (customer?.phone ?? '').replace(/^(\+?960)/, ''),
      notes: '',
      location_link: '',
      is_default: addresses.length === 0,
    });
    setAddressMsg(null);
    setShowAddressForm(true);
  };

  const startEditAddress = (a: CustomerAddress) => {
    setEditingAddressId(a.id);
    setAddressForm({
      label: a.label ?? '',
      address_line1: a.address_line1,
      address_line2: a.address_line2 ?? '',
      island: a.island,
      contact_name: a.contact_name,
      contact_phone: a.contact_phone.replace(/^(\+?960)/, ''),
      notes: a.notes ?? '',
      location_link: a.location_link ?? '',
      is_default: a.is_default,
    });
    setAddressMsg(null);
    setShowAddressForm(true);
  };

  const handleSaveAddress = async () => {
    if (!isAuthenticated) return;
    if (!addressForm.address_line1.trim() || !addressForm.island.trim()
      || !addressForm.contact_name.trim() || !addressForm.contact_phone.trim()) {
      setAddressMsg({ type: 'error', text: 'Please fill in address, island, contact name, and phone.' });
      return;
    }
    setAddressSaving(true);
    setAddressMsg(null);
    try {
      const payload = {
        label: addressForm.label.trim() || undefined,
        address_line1: addressForm.address_line1.trim(),
        address_line2: addressForm.address_line2.trim() || undefined,
        island: addressForm.island.trim(),
        contact_name: addressForm.contact_name.trim(),
        contact_phone: addressForm.contact_phone.trim(),
        notes: addressForm.notes.trim() || undefined,
        location_link: addressForm.location_link.trim() || undefined,
        is_default: addressForm.is_default,
      };
      if (editingAddressId) {
        await updateCustomerAddress(editingAddressId, payload);
      } else {
        await createCustomerAddress(payload);
      }
      setShowAddressForm(false);
      setEditingAddressId(null);
      reloadAddresses();
      setAddressMsg({ type: 'success', text: editingAddressId ? 'Address updated.' : 'Address saved.' });
    } catch (e) {
      setAddressMsg({ type: 'error', text: (e as Error).message || 'Could not save address.' });
    } finally {
      setAddressSaving(false);
    }
  };

  const handleDeleteAddress = async (id: number) => {
    if (!isAuthenticated || !window.confirm('Delete this address?')) return;
    try {
      await deleteCustomerAddress(id);
      reloadAddresses();
    } catch (e) {
      setAddressesError((e as Error).message || 'Could not delete address.');
    }
  };

  const handleSetDefaultAddress = async (id: number) => {
    if (!isAuthenticated) return;
    try {
      await setDefaultCustomerAddress(id);
      reloadAddresses();
    } catch (e) {
      setAddressesError((e as Error).message || 'Could not set default address.');
    }
  };

  const cancelAddressForm = () => {
    setShowAddressForm(false);
    setEditingAddressId(null);
  };

  return {
    addresses,
    addressesLoading,
    addressesError,
    addressForm,
    setAddressForm,
    editingAddressId,
    showAddressForm,
    addressSaving,
    addressMsg,
    startAddAddress,
    startEditAddress,
    handleSaveAddress,
    handleDeleteAddress,
    handleSetDefaultAddress,
    cancelAddressForm,
  };
}
