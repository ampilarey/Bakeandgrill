import type { LoyaltyAccount } from '@shared/types';
import {
  FieldRow, SectionCard, TIER_COLOR, alertStyle, btnStyle, inputStyle,
} from './accountShared';
import { OrderHistorySection } from './OrderHistorySection';
import type { useAccountProfile } from './useAccountProfile';

type ProfileSectionProps = {
  profile: ReturnType<typeof useAccountProfile>;
  loyalty: LoyaltyAccount | null;
  loyaltyError: string;
  onLogout: () => void;
};

export function ProfileSection({ profile, loyalty, loyaltyError, onLogout }: ProfileSectionProps) {
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <OrderHistorySection />

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
              {loyalty.points_balance.toLocaleString()} pts
            </span>
            <span style={{ fontSize: 12, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', opacity: 0.75, textTransform: 'capitalize' }}>
              {loyalty.tier} member
              {loyalty.lifetime_points != null ? ` · ${loyalty.lifetime_points.toLocaleString()} lifetime` : ''}
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
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)' }}>Loyalty Points</span>
            {loyaltyError && <span style={{ fontSize: 12, color: '#DC2626' }}>{loyaltyError}</span>}
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Earn 1 pt per MVR 1</span>
          </div>
        )}
      </div>

      <SectionCard title="Profile">
        {loadingProfile ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profileMsg && <div style={alertStyle(profileMsg.type)}>{profileMsg.text}</div>}

            <FieldRow label="Phone">
              <input
                style={{ ...inputStyle, background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', cursor: 'not-allowed' }}
                value={customer?.phone ?? ''}
                readOnly
              />
            </FieldRow>

            <FieldRow label="Name">
              <input
                style={inputStyle}
                value={profileForm.name}
                onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
              />
            </FieldRow>

            <FieldRow label="Email">
              <input
                type="email"
                style={inputStyle}
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </FieldRow>

            <FieldRow label="Date of birth">
              <input
                type="date"
                style={inputStyle}
                value={profileForm.date_of_birth}
                onChange={(e) => setProfileForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                max={new Date().toISOString().slice(0, 10)}
              />
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                Optional — used for birthday loyalty rewards (SMS only if you haven&apos;t opted out).
              </p>
            </FieldRow>

            <button
              style={{ ...btnStyle, opacity: savingProfile ? 0.6 : 1, cursor: savingProfile ? 'not-allowed' : 'pointer' }}
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Change Password">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pwMsg && <div style={alertStyle(pwMsg.type)}>{pwMsg.text}</div>}

          <FieldRow label="Current Password">
            <input
              type="password"
              style={inputStyle}
              value={pwForm.current_password}
              onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
              autoComplete="current-password"
            />
          </FieldRow>

          <FieldRow label="New Password">
            <input
              type="password"
              style={inputStyle}
              value={pwForm.new_password}
              onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>

          <FieldRow label="Confirm New Password">
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
            {savingPw ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </SectionCard>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => void onLogout()}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: '1.5px solid var(--color-error, #dc2626)',
            borderRadius: 10,
            fontSize: 14, fontWeight: 600,
            color: 'var(--color-error, #dc2626)',
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </div>
    </>
  );
}
