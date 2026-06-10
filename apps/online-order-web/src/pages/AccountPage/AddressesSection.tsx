import {
  FieldRow, SectionCard, alertStyle, btnStyle, inputStyle,
} from './accountShared';
import type { useAccountAddresses } from './useAccountAddresses';

type AddressesSectionProps = {
  addresses: ReturnType<typeof useAccountAddresses>;
};

export function AddressesSection({ addresses: addr }: AddressesSectionProps) {
  const {
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
  } = addr;

  return (
    <SectionCard title="Saved Delivery Addresses">
      {addressMsg && <div style={{ ...alertStyle(addressMsg.type), marginBottom: 14 }}>{addressMsg.text}</div>}
      {addressesError && <div style={{ ...alertStyle('error'), marginBottom: 14 }}>{addressesError}</div>}
      {addressesLoading && addresses.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          {addresses.length === 0 && !showAddressForm && (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
              No saved addresses yet. Add one for faster checkout.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {addresses.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>
                      {a.label || 'Address'}{a.is_default ? ' · Default' : ''}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''} · {a.island}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {a.contact_name} · {a.contact_phone}
                    </div>
                    {a.location_link && (
                      <a href={a.location_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-primary)', marginTop: 4, display: 'inline-block' }}>
                        Open map →
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {!a.is_default && (
                      <button type="button" onClick={() => void handleSetDefaultAddress(a.id)} style={{ ...btnStyle, height: 32, padding: '0 12px', fontSize: 12 }}>
                        Set default
                      </button>
                    )}
                    <button type="button" onClick={() => startEditAddress(a)} style={{ ...btnStyle, height: 32, padding: '0 12px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-dark)', border: '1px solid var(--color-border)' }}>
                      Edit
                    </button>
                    <button type="button" onClick={() => void handleDeleteAddress(a.id)} style={{ height: 32, padding: '0 12px', fontSize: 12, background: 'transparent', border: '1px solid var(--color-error, #dc2626)', color: 'var(--color-error, #dc2626)', borderRadius: 10, cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!showAddressForm ? (
            <button type="button" style={btnStyle} onClick={startAddAddress}>Add address</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{editingAddressId ? 'Edit address' : 'New address'}</h3>
              <FieldRow label="Label"><input style={inputStyle} value={addressForm.label} onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))} placeholder="Home, Office…" /></FieldRow>
              <FieldRow label="Address *"><input style={inputStyle} value={addressForm.address_line1} onChange={(e) => setAddressForm((f) => ({ ...f, address_line1: e.target.value }))} /></FieldRow>
              <FieldRow label="Address line 2"><input style={inputStyle} value={addressForm.address_line2} onChange={(e) => setAddressForm((f) => ({ ...f, address_line2: e.target.value }))} /></FieldRow>
              <FieldRow label="Island *"><input style={inputStyle} value={addressForm.island} onChange={(e) => setAddressForm((f) => ({ ...f, island: e.target.value }))} /></FieldRow>
              <FieldRow label="Location link"><input style={inputStyle} value={addressForm.location_link} onChange={(e) => setAddressForm((f) => ({ ...f, location_link: e.target.value }))} placeholder="https://maps.google.com/…" /></FieldRow>
              <FieldRow label="Contact name *"><input style={inputStyle} value={addressForm.contact_name} onChange={(e) => setAddressForm((f) => ({ ...f, contact_name: e.target.value }))} /></FieldRow>
              <FieldRow label="Contact phone *"><input style={inputStyle} value={addressForm.contact_phone} onChange={(e) => setAddressForm((f) => ({ ...f, contact_phone: e.target.value }))} /></FieldRow>
              <FieldRow label="Notes"><textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={addressForm.notes} onChange={(e) => setAddressForm((f) => ({ ...f, notes: e.target.value }))} /></FieldRow>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={addressForm.is_default} onChange={(e) => setAddressForm((f) => ({ ...f, is_default: e.target.checked }))} />
                Set as default address
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={{ ...btnStyle, opacity: addressSaving ? 0.6 : 1 }} disabled={addressSaving} onClick={() => void handleSaveAddress()}>
                  {addressSaving ? 'Saving…' : 'Save address'}
                </button>
                <button type="button" style={{ ...btnStyle, background: 'var(--color-surface)', color: 'var(--color-dark)', border: '1px solid var(--color-border)' }} onClick={cancelAddressForm}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
