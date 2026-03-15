import { useEffect, useRef, useState } from 'react';
import { Globe, Shield, Smartphone, Link2, Upload, Save, RefreshCw } from 'lucide-react';
import {
  getSiteSettings, getUserPermissions,
  updateSiteSettings, updateUserPermissions, uploadSiteLogo,
  fetchStaff, type PermissionItem, type SiteSettingsGroup,
} from '../api';
import { Button, Card, Input, Tabs, TabList, Tab, TabPanel, Toggle, Badge, useToast } from '../components/ui';

// ─── Sub-page cards ───────────────────────────────────────────────────────────
const HUB_CARDS = [
  { id: 'website',      icon: Globe,       label: 'Website Settings', desc: 'Site name, logo, colors, footer, SEO' },
  { id: 'permissions',  icon: Shield,      label: 'Roles & Permissions', desc: 'Manage role defaults and per-user overrides' },
  { id: 'devices',      icon: Smartphone,  label: 'Devices', desc: 'Register and manage POS/KDS devices' },
  { id: 'integrations', icon: Link2,       label: 'Integrations', desc: 'Xero, Webhooks, SMS provider' },
];

// ─── Website Settings sub-page ────────────────────────────────────────────────
function WebsiteSettings() {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<SiteSettingsGroup>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKey, setUploadKey] = useState<string | null>(null);

  useEffect(() => {
    getSiteSettings()
      .then(({ settings: s }) => {
        setSettings(s);
        const flat: Record<string, string> = {};
        Object.values(s).flat().forEach((item) => { flat[item.key] = item.value ?? ''; });
        setForm(flat);
      })
      .catch(() => error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSiteSettings(form);
      success('Settings saved successfully');
    } catch {
      error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadKey) return;
    try {
      const { url } = await uploadSiteLogo(uploadKey, file);
      setForm((f) => ({ ...f, [uploadKey]: url }));
      success('Image uploaded successfully');
    } catch {
      error('Upload failed');
    }
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-[10px]" />
        ))}
      </div>
    );
  }

  const groups = Object.keys(settings);
  const tabs = groups.length > 0 ? groups : ['General', 'Branding', 'Footer', 'Social', 'SEO'];

  return (
    <div className="space-y-5">
      <Tabs active={activeTab} onChange={setActiveTab}>
        <TabList>
          {tabs.map((g) => <Tab key={g} id={g.toLowerCase()}>{g}</Tab>)}
        </TabList>

        {tabs.map((group) => (
          <TabPanel key={group} id={group.toLowerCase()}>
            <div className="pt-5 space-y-4 max-w-2xl">
              {(settings[group] ?? []).map((item) => {
                if (item.type === 'image') {
                  return (
                    <div key={item.key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#1C1408]">{item.label}</label>
                      {item.description && <p className="text-xs text-[#9C8E7E]">{item.description}</p>}
                      <div className="flex items-center gap-3">
                        {form[item.key] ? (
                          <img src={form[item.key]} alt={item.label} className="w-16 h-16 object-contain rounded-[10px] border border-[#E8E0D8] p-1 bg-white" />
                        ) : (
                          <div className="w-16 h-16 rounded-[10px] border border-dashed border-[#E8E0D8] flex items-center justify-center text-[#9C8E7E]">
                            <Upload size={20} />
                          </div>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Upload size={14} />}
                          onClick={() => { setUploadKey(item.key); fileInputRef.current?.click(); }}
                        >
                          Upload
                        </Button>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'color') {
                  return (
                    <div key={item.key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#1C1408]">{item.label}</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={form[item.key] ?? '#000000'}
                          onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                          className="w-10 h-10 rounded-[8px] border border-[#E8E0D8] cursor-pointer p-0.5"
                        />
                        <Input
                          value={form[item.key] ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                          placeholder="#D4813A"
                          className="max-w-[160px]"
                        />
                      </div>
                    </div>
                  );
                }

                if (item.type === 'boolean') {
                  return (
                    <div key={item.key} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-semibold text-[#1C1408]">{item.label}</p>
                        {item.description && <p className="text-xs text-[#9C8E7E]">{item.description}</p>}
                      </div>
                      <Toggle
                        checked={form[item.key] === 'true'}
                        onChange={(v) => setForm((f) => ({ ...f, [item.key]: String(v) }))}
                      />
                    </div>
                  );
                }

                if (item.type === 'textarea' || item.type === 'json') {
                  return (
                    <div key={item.key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#1C1408]">{item.label}</label>
                      {item.description && <p className="text-xs text-[#9C8E7E]">{item.description}</p>}
                      <textarea
                        value={form[item.key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                        rows={item.type === 'json' ? 6 : 3}
                        className="w-full rounded-[10px] border border-[#E8E0D8] bg-white px-3 py-2 text-sm text-[#1C1408] outline-none resize-y focus:border-[#D4813A] focus:ring-2 focus:ring-[#D4813A]/20 font-mono"
                      />
                    </div>
                  );
                }

                return (
                  <Input
                    key={item.key}
                    label={item.label}
                    helper={item.description ?? undefined}
                    value={form[item.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                  />
                );
              })}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="primary" icon={<Save size={15} />} onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </div>
            </div>
          </TabPanel>
        ))}
      </Tabs>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
    </div>
  );
}

// ─── Permissions sub-page ─────────────────────────────────────────────────────
function PermissionsSettings() {
  const { success, error } = useToast();
  const [staff, setStaff] = useState<{ id: number; name: string; role: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [perms, setPerms] = useState<PermissionItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean | null>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStaff()
      .then(({ staff: s }) => setStaff(
        s.filter((u) => u.role !== 'owner').map((u) => ({ id: u.id, name: u.name, role: u.role ?? 'staff' }))
      ))
      .catch(() => error('Failed to load staff'));
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    setLoadingPerms(true);
    getUserPermissions(selectedUserId)
      .then(({ permissions }) => { setPerms(permissions); setOverrides({}); })
      .catch(() => error('Failed to load permissions'))
      .finally(() => setLoadingPerms(false));
  }, [selectedUserId]);

  const grouped = perms.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await updateUserPermissions(selectedUserId, overrides);
      success('Permissions saved');
      // Refresh
      const { permissions } = await getUserPermissions(selectedUserId);
      setPerms(permissions);
      setOverrides({});
    } catch {
      error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Card>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-[#1C1408]">Select staff member</label>
          <select
            value={selectedUserId ?? ''}
            onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
            className="h-9 rounded-[10px] border border-[#E8E0D8] bg-white px-3 text-sm text-[#1C1408] outline-none focus:border-[#D4813A] focus:ring-2 focus:ring-[#D4813A]/20"
          >
            <option value="">— Choose staff member —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
        </div>
      </Card>

      {selectedUserId && (
        <Card>
          {loadingPerms ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-9 rounded-[8px]" />)}
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="text-[11px] font-bold text-[#9C8E7E] uppercase tracking-wider mb-2">{group}</p>
                  <div className="space-y-1">
                    {items.map((p) => {
                      const effective = overrides[p.slug] !== undefined ? overrides[p.slug] : p.granted;
                      const isOverridden = overrides[p.slug] !== undefined;
                      return (
                        <div key={p.slug} className="flex items-center justify-between py-1.5 px-2 rounded-[8px] hover:bg-[#F8F6F3]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#1C1408]">{p.name}</span>
                            <Badge variant={p.source === 'override' ? 'brand' : 'neutral'} className="text-[10px]">
                              {isOverridden ? 'modified' : p.source}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Toggle
                              size="sm"
                              checked={Boolean(effective)}
                              onChange={(v) => setOverrides((o) => ({ ...o, [p.slug]: v }))}
                            />
                            {isOverridden && (
                              <button
                                onClick={() => setOverrides((o) => { const n = { ...o }; delete n[p.slug]; return n; })}
                                className="text-[10px] text-[#9C8E7E] hover:text-[#D4813A] underline"
                              >
                                reset
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center pt-3 border-t border-[#E8E0D8]">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw size={14} />}
                  onClick={() => setOverrides({})}
                >
                  Reset all changes
                </Button>
                <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSave} loading={saving}>
                  Save Permissions
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Devices sub-page (placeholder) ──────────────────────────────────────────
function DevicesSettings() {
  return (
    <div className="max-w-xl">
      <Card>
        <p className="text-sm text-[#9C8E7E]">
          POS and KDS devices are registered automatically on first login using a device ID stored in localStorage.
          Manage active devices from the Devices page.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => window.location.href = '/admin/devices'}>
            Manage Devices →
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Integrations sub-page (placeholder) ─────────────────────────────────────
function IntegrationsSettings() {
  return (
    <div className="max-w-xl">
      <Card>
        <p className="text-sm text-[#9C8E7E]">
          Configure Xero, Webhooks, and SMS integrations here.
        </p>
        <div className="mt-4 flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => window.location.href = '/admin/webhooks'}>
            Webhooks →
          </Button>
          <Button variant="secondary" onClick={() => window.location.href = '/admin/sms'}>
            SMS Campaigns →
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────
export function SettingsPage() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Settings — Bake & Grill Admin';
  }, []);

  if (active) {
    const card = HUB_CARDS.find((c) => c.id === active) ?? HUB_CARDS[0];
    return (
      <div className="animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 text-sm">
          <button
            onClick={() => setActive(null)}
            className="text-[#9C8E7E] hover:text-[#D4813A] transition-colors"
          >
            Settings
          </button>
          <span className="text-[#9C8E7E]">›</span>
          <span className="font-semibold text-[#1C1408]">{card.label}</span>
        </div>

        <div className="mb-5">
          <h1 className="text-xl font-bold text-[#1C1408]">{card.label}</h1>
          <p className="text-sm text-[#9C8E7E]">{card.desc}</p>
        </div>

        {active === 'website'      && <WebsiteSettings />}
        {active === 'permissions'  && <PermissionsSettings />}
        {active === 'devices'      && <DevicesSettings />}
        {active === 'integrations' && <IntegrationsSettings />}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1C1408]">Settings</h1>
        <p className="text-sm text-[#9C8E7E] mt-1">Manage your business settings, permissions, and integrations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {HUB_CARDS.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className="text-left p-5 bg-white border border-[#E8E0D8] rounded-[14px] shadow-[0_1px_2px_rgba(28,20,8,0.05)] hover:border-[#D4813A]/40 hover:shadow-md transition-all group"
          >
            <div className="w-10 h-10 rounded-[10px] bg-[#D4813A]/10 flex items-center justify-center text-[#D4813A] mb-3 group-hover:bg-[#D4813A]/20 transition-colors">
              <Icon size={20} />
            </div>
            <p className="font-bold text-[#1C1408] text-sm mb-1">{label}</p>
            <p className="text-xs text-[#9C8E7E] leading-relaxed">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
