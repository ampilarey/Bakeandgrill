import type { LoyaltyAccount } from '@shared/types';
import { useLanguage } from '../../context/LanguageContext';
import {
  FieldRow, SectionCard, TIER_COLOR, alertStyle, btnStyle, inputStyle,
} from './accountShared';
import type { useAccountProfile } from './useAccountProfile';

type ProfileSectionProps = {
  profile: ReturnType<typeof useAccountProfile>;
  loyalty: LoyaltyAccount | null;
  loyaltyError: string;
  onLogout?: () => void;
};

export function ProfileSection({ profile, loyalty, loyaltyError }: ProfileSectionProps) {
  const { t } = useLanguage();
  const {
    customer,
    loadingProfile,
    profileForm,
    setProfileForm,
    savingProfile,
    profileMsg,
    pwForm,
    setPwForm,
    savingPw,
    pwMsg,
    handleSaveProfile,
    handleChangePassword,
  } = profile;

  return (
    <>
      {loyalty ? (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '16px 18px',
          background: TIER_COLOR[loyalty.tier]?.bg ?? '#FEF3E2',
          border: `1px solid ${TIER_COLOR[loyalty.tier]?.border ?? '#FCD34D'}`,
          borderRadius: 14,
        }}>
          <span style={{ fontSize: 22 }}>⭐</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E' }}>
            {t('account.loyalty_pts').replace('{n}', loyalty.points_balance.toLocaleString())}
          </span>
          <span style={{ fontSize: 12, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', opacity: 0.75, textTransform: 'capitalize' }}>
            {t('account.profile_member').replace('{tier}', loyalty.tier)}
            {loyalty.lifetime_points != null ? ` · ${t('account.profile_lifetime').replace('{n}', loyalty.lifetime_points.toLocaleString())}` : ''}
          </span>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '16px 18px',
          background: loyaltyError ? '#FEF2F2' : 'var(--color-surface)',
          border: loyaltyError ? '1px solid #FECACA' : '1px solid var(--color-border)',
          borderRadius: 14,
        }}>
          <span style={{ fontSize: 22 }}>⭐</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)' }}>{t('account.profile_loyalty_title')}</span>
          {loyaltyError && <span style={{ fontSize: 12, color: '#DC2626' }}>{loyaltyError}</span>}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t('account.profile_loyalty_rate')}</span>
        </div>
      )}

      <SectionCard title={t('account.profile')}>
        {loadingProfile ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('account.loading')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profileMsg && <div style={alertStyle(profileMsg.type)}>{profileMsg.text}</div>}

            <FieldRow label={t('account.profile_phone')}>
              <input
                style={{ ...inputStyle, background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', cursor: 'not-allowed' }}
                value={customer?.phone ?? ''}
                readOnly
              />
            </FieldRow>

            <FieldRow label={t('account.profile_name')}>
              <input
                style={inputStyle}
                value={profileForm.name}
                onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('account.profile_name_ph')}
              />
            </FieldRow>

            <FieldRow label={t('account.profile_email')}>
              <input
                type="email"
                style={inputStyle}
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t('account.profile_email_ph')}
              />
            </FieldRow>

            <FieldRow label={t('account.profile_dob')}>
              <input
                type="date"
                style={inputStyle}
                value={profileForm.date_of_birth}
                onChange={(e) => setProfileForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                max={new Date().toISOString().slice(0, 10)}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                {t('account.profile_dob_hint')}
              </p>
            </FieldRow>

            <button
              style={{ ...btnStyle, opacity: savingProfile ? 0.6 : 1, cursor: savingProfile ? 'not-allowed' : 'pointer' }}
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile}
            >
              {savingProfile ? t('account.profile_saving') : t('account.profile_save')}
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('account.profile_pw_title')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pwMsg && <div style={alertStyle(pwMsg.type)}>{pwMsg.text}</div>}

          <FieldRow label={t('account.profile_pw_current')}>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.current_password}
              onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
              autoComplete="current-password"
            />
          </FieldRow>

          <FieldRow label={t('account.profile_pw_new')}>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.new_password}
              onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>

          <FieldRow label={t('account.profile_pw_confirm')}>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm_password: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>

          <button
            style={{ ...btnStyle, opacity: savingPw ? 0.6 : 1, cursor: savingPw ? 'not-allowed' : 'pointer' }}
            onClick={() => void handleChangePassword()}
            disabled={savingPw}
          >
            {savingPw ? t('account.profile_pw_changing') : t('account.profile_pw_cta')}
          </button>
        </div>
      </SectionCard>

    </>
  );
}
