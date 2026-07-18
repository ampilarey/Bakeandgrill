import { useLanguage } from '../../context/LanguageContext';
import {
  FieldRow, SectionCard, alertStyle, btnStyle, inputStyle,
} from './accountShared';
import type { useAccountAddresses } from './useAccountAddresses';

type AddressesSectionProps = {
  addresses: ReturnType<typeof useAccountAddresses>;
};

export function AddressesSection({ addresses: addr }: AddressesSectionProps) {
  const { t } = useLanguage();
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
    <SectionCard title={t('account.addr_title')}>
      {addressMsg && <div style={{ ...alertStyle(addressMsg.type), marginBottom: 14 }}>{addressMsg.text}</div>}
      {addressesError && <div style={{ ...alertStyle('error'), marginBottom: 14 }}>{addressesError}</div>}
      {addressesLoading && addresses.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('account.loading')}</p>
      ) : (
        <>
          {addresses.length === 0 && !showAddressForm && (
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
              {t('account.addr_empty')}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {addresses.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>
                      {a.label || t('account.addr_fallback')}{a.is_default ? ` · ${t('account.addr_default')}` : ''}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''} · {a.island}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {a.contact_name} · {a.contact_phone}
                    </div>
                    {a.location_link && (
                      <a href={a.location_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-primary)', marginTop: 4, display: 'inline-block' }}>
                        {t('account.addr_map')}
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {!a.is_default && (
                      <button type="button" onClick={() => void handleSetDefaultAddress(a.id)} style={{ ...btnStyle, height: 32, padding: '0 12px', fontSize: 12 }}>
                        {t('account.addr_set_default')}
                      </button>
                    )}
                    <button type="button" onClick={() => startEditAddress(a)} style={{ ...btnStyle, height: 32, padding: '0 12px', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-dark)', border: '1px solid var(--color-border)' }}>
                      {t('account.addr_edit_btn')}
                    </button>
                    <button type="button" onClick={() => void handleDeleteAddress(a.id)} style={{ height: 32, padding: '0 12px', fontSize: 12, background: 'transparent', border: '1px solid var(--color-error, #dc2626)', color: 'var(--color-error, #dc2626)', borderRadius: 10, cursor: 'pointer' }}>
                      {t('account.addr_delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!showAddressForm ? (
            <button type="button" style={btnStyle} onClick={startAddAddress}>{t('account.addr_add')}</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{editingAddressId ? t('account.addr_edit') : t('account.addr_new')}</h3>
              <FieldRow label={t('account.addr_label')}><input style={inputStyle} value={addressForm.label} onChange={(e) => setAddressForm((f) => ({ ...f, label: e.target.value }))} placeholder={t('account.addr_label_ph')} /></FieldRow>
              <FieldRow label={t('account.addr_line1')}><input style={inputStyle} value={addressForm.address_line1} onChange={(e) => setAddressForm((f) => ({ ...f, address_line1: e.target.value }))} /></FieldRow>
              <FieldRow label={t('account.addr_line2')}><input style={inputStyle} value={addressForm.address_line2} onChange={(e) => setAddressForm((f) => ({ ...f, address_line2: e.target.value }))} /></FieldRow>
              <FieldRow label={t('account.addr_island')}><input style={inputStyle} value={addressForm.island} onChange={(e) => setAddressForm((f) => ({ ...f, island: e.target.value }))} /></FieldRow>
              <FieldRow label={t('account.addr_maps')}><input style={inputStyle} value={addressForm.location_link} onChange={(e) => setAddressForm((f) => ({ ...f, location_link: e.target.value }))} placeholder={t('account.addr_maps_ph')} /></FieldRow>
              <FieldRow label={t('account.addr_contact_name')}><input style={inputStyle} value={addressForm.contact_name} onChange={(e) => setAddressForm((f) => ({ ...f, contact_name: e.target.value }))} /></FieldRow>
              <FieldRow label={t('account.addr_contact_phone')}><input style={inputStyle} value={addressForm.contact_phone} onChange={(e) => setAddressForm((f) => ({ ...f, contact_phone: e.target.value }))} /></FieldRow>
              <FieldRow label={t('account.addr_notes')}><textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={addressForm.notes} onChange={(e) => setAddressForm((f) => ({ ...f, notes: e.target.value }))} /></FieldRow>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={addressForm.is_default} onChange={(e) => setAddressForm((f) => ({ ...f, is_default: e.target.checked }))} />
                {t('account.addr_set_default_check')}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={{ ...btnStyle, opacity: addressSaving ? 0.6 : 1 }} disabled={addressSaving} onClick={() => void handleSaveAddress()}>
                  {addressSaving ? t('account.addr_saving') : t('account.addr_save')}
                </button>
                <button type="button" style={{ ...btnStyle, background: 'var(--color-surface)', color: 'var(--color-dark)', border: '1px solid var(--color-border)' }} onClick={cancelAddressForm}>
                  {t('account.cancel')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
