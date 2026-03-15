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

const WEEK_DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

function BusinessHoursEditor({
  label, description, value, onChange,
}: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(value || '{}'); } catch { /* keep empty */ }

  const update = (day: string, v: string) => {
    onChange(JSON.stringify({ ...parsed, [day]: v }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {WEEK_DAYS.map(({ key, label: dayLabel }, i) => {
          const val = parsed[key] ?? '';
          const isClosed = val.toLowerCase() === 'closed';
          return (
            <div
              key={key}
              style={{
                display: 'flex', alignItems: 'center', padding: '10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid #F0EBE5', gap: 12,
                background: isClosed ? '#FAFAFA' : '#fff',
              }}
            >
              <span style={{ width: 90, fontSize: 13, fontWeight: 600, color: '#1C1408', flexShrink: 0 }}>
                {dayLabel}
              </span>
              <input
                value={val}
                onChange={(e) => update(key, e.target.value)}
                placeholder="e.g. 8:00 AM – 8:00 PM or Closed"
                style={{
                  flex: 1, height: 32, padding: '0 10px',
                  border: '1px solid #E8E0D8', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  color: isClosed ? '#9C8E7E' : '#1C1408',
                  background: '#fff',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  const groups = Object.keys(settings);
  const tabs = groups.length > 0 ? groups : ['General', 'Branding', 'Footer', 'Social', 'SEO'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Tabs active={activeTab} onChange={setActiveTab}>
        <TabList>
          {tabs.map((g) => <Tab key={g} id={g.toLowerCase()}>{g}</Tab>)}
        </TabList>

        {tabs.map((group) => (
          <TabPanel key={group} id={group.toLowerCase()}>
            <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 640 }}>
              {(settings[group] ?? []).map((item) => {

                // ── Image upload ───────────────────────────────────
                if (item.type === 'image') {
                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{item.label}</label>
                      {item.description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{item.description}</p>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {form[item.key] ? (
                          <img
                            src={form[item.key]}
                            alt={item.label}
                            style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, border: '1px solid #E8E0D8', padding: 4, background: '#fff' }}
                          />
                        ) : (
                          <div style={{ width: 64, height: 64, borderRadius: 10, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E' }}>
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

                // ── Colour picker ──────────────────────────────────
                if (item.type === 'color') {
                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{item.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                          type="color"
                          value={form[item.key] ?? '#000000'}
                          onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                          style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #E8E0D8', cursor: 'pointer', padding: 2 }}
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

                // ── Boolean toggle ─────────────────────────────────
                if (item.type === 'boolean') {
                  return (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F0EBE5' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1408', margin: 0 }}>{item.label}</p>
                        {item.description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '2px 0 0' }}>{item.description}</p>}
                      </div>
                      <Toggle
                        checked={form[item.key] === 'true'}
                        onChange={(v) => setForm((f) => ({ ...f, [item.key]: String(v) }))}
                      />
                    </div>
                  );
                }

                // ── Business Hours JSON ────────────────────────────
                if (item.type === 'json' && item.key.toLowerCase().includes('hour')) {
                  return (
                    <BusinessHoursEditor
                      key={item.key}
                      label={item.label}
                      description={item.description ?? undefined}
                      value={form[item.key] ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))}
                    />
                  );
                }

                // ── Generic textarea / JSON ────────────────────────
                if (item.type === 'textarea' || item.type === 'json') {
                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{item.label}</label>
                      {item.description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{item.description}</p>}
                      <textarea
                        value={form[item.key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                        rows={item.type === 'json' ? 6 : 3}
                        style={{
                          width: '100%', borderRadius: 10, border: '1.5px solid #E8E0D8',
                          background: '#fff', padding: '10px 12px', fontSize: 13,
                          fontFamily: 'monospace', outline: 'none', resize: 'vertical',
                          color: '#1C1408', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  );
                }

                // ── Default text input ─────────────────────────────
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <Button variant="primary" icon={<Save size={15} />} onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </div>
            </div>
          </TabPanel>
        ))}
      </Tabs>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>Select staff member</label>
          <select
            value={selectedUserId ?? ''}
            onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
            style={{
              height: 36, borderRadius: 10, border: '1.5px solid #E8E0D8',
              background: '#fff', padding: '0 12px', fontSize: 14, fontFamily: 'inherit',
              color: '#1C1408', outline: 'none', cursor: 'pointer',
            }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, margin: '0 0 8px' }}>
                    {group}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {items.map((p) => {
                      const effective = overrides[p.slug] !== undefined ? overrides[p.slug] : p.granted;
                      const isOverridden = overrides[p.slug] !== undefined;
                      return (
                        <div
                          key={p.slug}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 10px', borderRadius: 8,
                            background: isOverridden ? '#FFF8F3' : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, color: '#1C1408' }}>{p.name}</span>
                            <Badge variant={p.source === 'override' ? 'brand' : 'neutral'} className="text-[10px]">
                              {isOverridden ? 'modified' : p.source}
                            </Badge>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Toggle
                              size="sm"
                              checked={Boolean(effective)}
                              onChange={(v) => setOverrides((o) => ({ ...o, [p.slug]: v }))}
                            />
                            {isOverridden && (
                              <button
                                onClick={() => setOverrides((o) => { const n = { ...o }; delete n[p.slug]; return n; })}
                                style={{ fontSize: 11, color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #E8E0D8' }}>
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
    <div style={{ maxWidth: 520 }}>
      <Card>
        <p style={{ fontSize: 14, color: '#9C8E7E', margin: 0 }}>
          POS and KDS devices are registered automatically on first login using a device ID stored in localStorage.
          Manage active devices from the Devices page.
        </p>
        <div style={{ marginTop: 16 }}>
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
    <div style={{ maxWidth: 520 }}>
      <Card>
        <p style={{ fontSize: 14, color: '#9C8E7E', margin: 0 }}>
          Configure Xero, Webhooks, and SMS integrations here.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
          <button
            onClick={() => setActive(null)}
            style={{ color: '#9C8E7E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0 }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#D4813A')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#9C8E7E')}
          >
            Settings
          </button>
          <span style={{ color: '#9C8E7E' }}>›</span>
          <span style={{ fontWeight: 600, color: '#1C1408' }}>{card.label}</span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1C1408', margin: 0 }}>{card.label}</h1>
          <p style={{ fontSize: 14, color: '#9C8E7E', marginTop: 4 }}>{card.desc}</p>
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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1C1408', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 14, color: '#9C8E7E', marginTop: 4 }}>Manage your business settings, permissions, and integrations</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {HUB_CARDS.map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            style={{
              textAlign: 'left', padding: 20,
              background: '#fff', border: '1.5px solid #E8E0D8',
              borderRadius: 14, boxShadow: '0 1px 2px rgba(28,20,8,0.05)',
              cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'rgba(212,129,58,0.4)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(28,20,8,0.08)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#E8E0D8';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(28,20,8,0.05)';
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,129,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4813A', marginBottom: 12 }}>
              <Icon size={20} />
            </div>
            <p style={{ fontWeight: 700, color: '#1C1408', fontSize: 14, margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 12, color: '#9C8E7E', lineHeight: 1.5, margin: 0 }}>{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
