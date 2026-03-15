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
  { id: 'website',      icon: Globe,       label: 'Website Settings', desc: 'Hero slides, homepage content, contact info, branding & SEO' },
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

// ─── Business Hours editor ────────────────────────────────────────────────────
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

// ─── Hero Slide editor ────────────────────────────────────────────────────────
function HeroSlideEditor({
  label, description, uploadKey, value, onChange, triggerUpload,
}: {
  label: string; description?: string; uploadKey: string;
  value: string; onChange: (v: string) => void;
  triggerUpload: (key: string, onDone: (url: string) => void) => void;
}) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(value || '{}'); } catch { /* empty */ }

  const update = (field: string, v: string) => {
    onChange(JSON.stringify({ ...parsed, [field]: v }));
  };

  const fields = [
    { key: 'eyebrow',   label: 'Eyebrow tag',            col: 'half', placeholder: "Malé's neighbourhood café" },
    { key: 'cta_text',  label: 'Button 1 text',          col: 'half', placeholder: 'Order Now →' },
    { key: 'cta_url',   label: 'Button 1 URL',           col: 'half', placeholder: '/order/' },
    { key: 'cta2_text', label: 'Button 2 text',          col: 'half', placeholder: 'View Menu' },
    { key: 'cta2_url',  label: 'Button 2 URL',           col: 'half', placeholder: '/menu' },
    { key: 'title',     label: 'Title (HTML: <br> <em>)', col: 'full', placeholder: 'Dhivehi breakfast<br>meets <em>artisan baking</em>' },
    { key: 'subtitle',  label: 'Subtitle',               col: 'full', placeholder: 'Real food. Proper char. Baked fresh at 5am.' },
  ];

  return (
    <div style={{ background: '#FAFAF8', borderRadius: 12, border: '1.5px solid #E8E0D8', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1408', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '3px 0 0' }}>{description}</p>}
      </div>

      {/* Image row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slide Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {parsed.image ? (
            <img src={parsed.image} alt="slide" style={{ height: 54, width: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8', flexShrink: 0 }} />
          ) : (
            <div style={{ height: 54, width: 90, borderRadius: 8, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 11, flexShrink: 0 }}>
              No image
            </div>
          )}
          <Button variant="secondary" size="sm" icon={<Upload size={13} />}
            onClick={() => triggerUpload(uploadKey, (url) => update('image', url))}>
            Upload image
          </Button>
          <input
            value={parsed.image ?? ''}
            onChange={(e) => update('image', e.target.value)}
            placeholder="/images/cafe/filename.jpg"
            style={{ flex: 1, minWidth: 160, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#6B5D4F' }}
          />
        </div>
      </div>

      {/* Text fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {fields.map((f) => (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.col === 'full' ? '1 / -1' : undefined }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B5D4F' }}>{f.label}</label>
            <input
              value={parsed[f.key] ?? ''}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder}
              style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Trust Items editor (4 rows: icon · heading · subtext) ───────────────────
function TrustItemsEditor({
  label, description, value, onChange,
}: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let items: { icon: string; heading: string; subtext: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 4) items.push({ icon: '', heading: '', subtext: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next.slice(0, 4)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {items.slice(0, 4).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F0EBE5', gap: 8 }}>
            <input
              value={item.icon}
              onChange={(e) => update(idx, 'icon', e.target.value)}
              placeholder="🌅"
              style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }}
            />
            <input
              value={item.heading}
              onChange={(e) => update(idx, 'heading', e.target.value)}
              placeholder="Heading"
              style={{ flex: 2, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
            />
            <input
              value={item.subtext}
              onChange={(e) => update(idx, 'subtext', e.target.value)}
              placeholder="Subtext"
              style={{ flex: 3, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Proof Details editor (3 rows: value · label) ────────────────────────────
function ProofDetailsEditor({
  label, description, value, onChange,
}: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let items: { value: string; label: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 3) items.push({ value: '', label: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next.slice(0, 3)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {items.slice(0, 3).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F0EBE5', gap: 8 }}>
            <input
              value={item.value}
              onChange={(e) => update(idx, 'value', e.target.value)}
              placeholder="500+"
              style={{ width: 90, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', color: '#1C1408', flexShrink: 0 }}
            />
            <input
              value={item.label}
              onChange={(e) => update(idx, 'label', e.target.value)}
              placeholder="Label"
              style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Categories editor (4 rows with image upload) ────────────────────────────
function CategoriesEditor({
  label, description, value, onChange, triggerUpload,
}: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
  triggerUpload: (key: string, onDone: (url: string) => void) => void;
}) {
  let items: { icon: string; label: string; name: string; hook: string; image_url: string; link: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 4) items.push({ icon: '', label: '', name: '', hook: '', image_url: '', link: '/menu' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next.slice(0, 4)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.slice(0, 4).map((item, idx) => (
          <div key={idx} style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Row 1: icon, label, name, link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={item.icon}
                onChange={(e) => update(idx, 'icon', e.target.value)}
                placeholder="🥐"
                title="Emoji icon (fallback)"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }}
              />
              <input
                value={item.label}
                onChange={(e) => update(idx, 'label', e.target.value)}
                placeholder="Label tag"
                style={{ flex: 1, minWidth: 80, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
              />
              <input
                value={item.name}
                onChange={(e) => update(idx, 'name', e.target.value)}
                placeholder="Card title"
                style={{ flex: 2, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
              />
              <input
                value={item.link}
                onChange={(e) => update(idx, 'link', e.target.value)}
                placeholder="/menu"
                title="Link URL"
                style={{ width: 80, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#1C1408', flexShrink: 0 }}
              />
            </div>
            {/* Row 2: hook */}
            <input
              value={item.hook}
              onChange={(e) => update(idx, 'hook', e.target.value)}
              placeholder="Short hook text shown on the card"
              style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }}
            />
            {/* Row 3: image */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.image_url ? (
                <img src={item.image_url} alt="cat" style={{ height: 36, width: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #E8E0D8', flexShrink: 0 }} />
              ) : (
                <div style={{ height: 36, width: 56, borderRadius: 6, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 10, flexShrink: 0 }}>
                  no img
                </div>
              )}
              <Button variant="secondary" size="sm" icon={<Upload size={13} />}
                onClick={() => triggerUpload(`cat_${idx + 1}_image`, (url) => update(idx, 'image_url', url))}>
                Upload
              </Button>
              <input
                value={item.image_url}
                onChange={(e) => update(idx, 'image_url', e.target.value)}
                placeholder="/images/cafe/photo.jpg"
                style={{ flex: 1, minWidth: 140, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#6B5D4F' }}
              />
            </div>
          </div>
        ))}
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
  // For JSON-field uploads, store a callback that receives the uploaded URL
  const [uploadCallback, setUploadCallback] = useState<{ fn: (url: string) => void } | null>(null);

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

  const triggerUpload = (key: string, onDone: (url: string) => void) => {
    setUploadKey(key);
    setUploadCallback({ fn: onDone });
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadKey) return;
    try {
      const { url } = await uploadSiteLogo(uploadKey, file);
      if (uploadCallback) {
        uploadCallback.fn(url);
      } else {
        setForm((f) => ({ ...f, [uploadKey]: url }));
      }
      success('Image uploaded successfully');
    } catch {
      error('Upload failed');
    }
    setUploadCallback(null);
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
            <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680 }}>
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
                          onClick={() => { setUploadKey(item.key); setUploadCallback(null); fileInputRef.current?.click(); }}
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

                // ── Hero Slide JSON ────────────────────────────────
                if (item.type === 'json' && /^hero_slide_\d$/.test(item.key)) {
                  const slideNum = item.key.replace('hero_slide_', '');
                  return (
                    <HeroSlideEditor
                      key={item.key}
                      label={item.label}
                      description={item.description ?? undefined}
                      uploadKey={`hero_${slideNum}_image`}
                      value={form[item.key] ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))}
                      triggerUpload={triggerUpload}
                    />
                  );
                }

                // ── Trust Items JSON ───────────────────────────────
                if (item.type === 'json' && item.key === 'trust_items') {
                  return (
                    <TrustItemsEditor
                      key={item.key}
                      label={item.label}
                      description={item.description ?? undefined}
                      value={form[item.key] ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))}
                    />
                  );
                }

                // ── Proof Details JSON ─────────────────────────────
                if (item.type === 'json' && item.key === 'proof_details') {
                  return (
                    <ProofDetailsEditor
                      key={item.key}
                      label={item.label}
                      description={item.description ?? undefined}
                      value={form[item.key] ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))}
                    />
                  );
                }

                // ── Homepage Categories JSON ───────────────────────
                if (item.type === 'json' && item.key === 'homepage_categories') {
                  return (
                    <CategoriesEditor
                      key={item.key}
                      label={item.label}
                      description={item.description ?? undefined}
                      value={form[item.key] ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))}
                      triggerUpload={triggerUpload}
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
