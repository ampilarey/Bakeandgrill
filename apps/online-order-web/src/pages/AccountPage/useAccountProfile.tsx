import { useEffect, useState } from 'react';
import { getCustomerMe, updateCustomerProfile, changeCustomerPassword } from '../../api';
import type { AuthCustomer } from '../../api';
import { useLanguage } from '../../context/LanguageContext';

export function useAccountProfile(isAuthenticated: boolean, authReady: boolean) {
  const { t } = useLanguage();
  const [customer, setCustomer] = useState<AuthCustomer | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '', date_of_birth: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    setLoadingProfile(true);
    getCustomerMe()
      .then((res) => {
        setCustomer(res.customer as AuthCustomer);
        setProfileForm({
          name: res.customer.name ?? '',
          email: (res.customer as AuthCustomer).email ?? '',
          date_of_birth: (res.customer as AuthCustomer).date_of_birth ?? '',
        });
      })
      .catch((e: Error) => setProfileMsg({ type: 'error', text: e.message || t('account.profile_err_load') }))
      .finally(() => setLoadingProfile(false));
  }, [isAuthenticated, authReady, t]);

  const handleSaveProfile = async () => {
    if (!isAuthenticated) return;
    setSavingProfile(true); setProfileMsg(null);
    try {
      const res = await updateCustomerProfile({
        name: profileForm.name || undefined,
        email: profileForm.email || undefined,
        date_of_birth: profileForm.date_of_birth || null,
      });
      setCustomer(res.customer);
      setProfileMsg({ type: 'success', text: t('account.profile_ok') });
    } catch (e) {
      setProfileMsg({ type: 'error', text: (e as Error).message || t('account.profile_err_save') });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!isAuthenticated) return;
    if (!pwForm.current_password || !pwForm.new_password) {
      setPwMsg({ type: 'error', text: t('account.pw_err_all') });
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: 'error', text: t('account.pw_err_mismatch') });
      return;
    }
    if (pwForm.new_password.length < 8) {
      setPwMsg({ type: 'error', text: t('account.pw_err_short') });
      return;
    }
    setSavingPw(true); setPwMsg(null);
    try {
      await changeCustomerPassword({
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwMsg({ type: 'success', text: t('account.pw_ok') });
    } catch (e) {
      setPwMsg({ type: 'error', text: (e as Error).message || t('account.pw_err_change') });
    } finally {
      setSavingPw(false);
    }
  };

  return {
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
  };
}
