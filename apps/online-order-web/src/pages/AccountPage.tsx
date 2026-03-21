import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import { getCustomerMe, updateCustomerProfile, changeCustomerPassword } from '../api';
import type { AuthCustomer } from '../api';
import { AuthBlock } from '../components/AuthBlock';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 42, padding: '0 20px',
  background: 'var(--color-primary)', color: '#fff',
  border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
};

const alertStyle = (type: 'error' | 'success'): React.CSSProperties => ({
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: 13,
  background: type === 'error' ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
  color: type === 'error' ? 'var(--color-error)' : 'var(--color-success)',
  border: `1px solid ${type === 'error' ? 'var(--color-error)' : 'var(--color-success)'}`,
});

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      padding: '20px 24px',
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-dark)', margin: '0 0 18px' }}>{title}</h2>
      {children}
    </div>
  );
}

export function AccountPage() {
  usePageTitle('My Account');
  const { token, authReady, setAuth, customerName } = useAuth();

  const [customer, setCustomer] = useState<AuthCustomer | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Profile edit state
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Password change state
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!authReady || !token) return;
    setLoadingProfile(true);
    getCustomerMe(token)
      .then((res) => {
        setCustomer(res.customer as AuthCustomer);
        setProfileForm({ name: res.customer.name ?? '', email: (res.customer as AuthCustomer).email ?? '' });
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, [token, authReady]);

  const handleAuthSuccess = (tok: string, name: string) => setAuth(tok, name);

  const handleSaveProfile = async () => {
    if (!token) return;
    setSavingProfile(true); setProfileMsg(null);
    try {
      const res = await updateCustomerProfile(token, {
        name: profileForm.name || undefined,
        email: profileForm.email || undefined,
      });
      setCustomer(res.customer);
      setProfileMsg({ type: 'success', text: 'Profile updated.' });
    } catch (e) {
      setProfileMsg({ type: 'error', text: (e as Error).message || 'Could not save changes.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!token) return;
    if (!pwForm.current_password || !pwForm.new_password) {
      setPwMsg({ type: 'error', text: 'Please fill in all password fields.' });
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (pwForm.new_password.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setSavingPw(true); setPwMsg(null);
    try {
      await changeCustomerPassword(token, {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
    } catch (e) {
      setPwMsg({ type: 'error', text: (e as Error).message || 'Could not change password. Check your current password.' });
    } finally {
      setSavingPw(false);
    }
  };

  if (!authReady) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem var(--page-gutter)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '2rem var(--page-gutter)' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Account</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.375rem 0 0' }}>
            Log in to view and manage your account.
          </p>
        </div>
        <AuthBlock onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '2rem var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Account</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.375rem 0 0' }}>
          Hi, {customerName ?? customer?.name ?? 'there'} — manage your profile and password.
        </p>
      </div>

      {/* Profile section */}
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

      {/* Password section */}
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
    </div>
  );
}

export default AccountPage;
