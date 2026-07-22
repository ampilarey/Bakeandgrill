import { useEffect, useRef, useState } from 'react';
import { Upload, Save } from 'lucide-react';
import { getSiteSettings, updateSiteSettings, uploadSiteLogo, type SiteSettingsGroup } from '../../api';

/** Ops groups managed on Ordering Control / Delivery — never show in Website Settings tabs */
const WEBSITE_OPS_GROUPS = new Set(['ordering', 'online ordering', 'delivery', 'charges']);
import { Button, Input, Tabs, TabList, Tab, TabPanel, Toggle, useToast } from '../../components/ui';

const WEEK_DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

function BusinessHoursEditor({ label, description, value, onChange }: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(value || '{}'); } catch { /* keep empty */ }

  const update = (day: string, v: string) => onChange(JSON.stringify({ ...parsed, [day]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {WEEK_DAYS.map(({ key, label: dayLabel }, i) => {
          const val = parsed[key] ?? '';
          const isClosed = val.toLowerCase() === 'closed';
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid #F0EBE5', gap: 12, background: isClosed ? '#FAFAFA' : '#fff' }}>
              <span style={{ width: 90, fontSize: 13, fontWeight: 600, color: '#1C1408', flexShrink: 0 }}>{dayLabel}</span>
              <input
                value={val}
                onChange={(e) => update(key, e.target.value)}
                placeholder="e.g. 8:00 AM – 8:00 PM or Closed"
                style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: isClosed ? '#9C8E7E' : '#1C1408', background: '#fff' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroSlideEditor({ label, description, uploadKey, value, onChange, triggerUpload }: {
  label: string; description?: string; uploadKey: string;
  value: string; onChange: (v: string) => void;
  triggerUpload: (key: string, onDone: (url: string) => void) => void;
}) {
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(value || '{}'); } catch { /* empty */ }

  const update = (field: string, v: string) => onChange(JSON.stringify({ ...parsed, [field]: v }));

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B5D4F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slide Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {parsed.image ? (
            <img src={parsed.image} alt="slide" style={{ height: 54, width: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E0D8', flexShrink: 0 }} />
          ) : (
            <div style={{ height: 54, width: 90, borderRadius: 8, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 11, flexShrink: 0 }}>No image</div>
          )}
          <Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => triggerUpload(uploadKey, (url) => update('image', url))}>
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
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {fields.map((f) => (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.col === 'full' ? '1 / -1' : undefined }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B5D4F' }}>{f.label}</label>
            <input value={parsed[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder}
              style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TrustItemsEditor({ label, description, value, onChange }: {
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
            <input value={item.icon} onChange={(e) => update(idx, 'icon', e.target.value)} placeholder="🌅"
              style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
            <input value={item.heading} onChange={(e) => update(idx, 'heading', e.target.value)} placeholder="Heading"
              style={{ flex: 2, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <input value={item.subtext} onChange={(e) => update(idx, 'subtext', e.target.value)} placeholder="Subtext"
              style={{ flex: 3, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProofDetailsEditor({ label, description, value, onChange }: {
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
            <input value={item.value} onChange={(e) => update(idx, 'value', e.target.value)} placeholder="500+"
              style={{ width: 90, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', color: '#1C1408', flexShrink: 0 }} />
            <input value={item.label} onChange={(e) => update(idx, 'label', e.target.value)} placeholder="Label"
              style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutValuesEditor({ label, description, value, onChange }: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let items: { initial: string; title: string; description: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 4) items.push({ initial: '', title: '', description: '' });

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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={item.initial} onChange={(e) => update(idx, 'initial', e.target.value)} placeholder="F" title="Initial letter"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
              <input value={item.title} onChange={(e) => update(idx, 'title', e.target.value)} placeholder="Title"
                style={{ flex: 1, minWidth: 120, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            </div>
            <input value={item.description} onChange={(e) => update(idx, 'description', e.target.value)} placeholder="Description"
              style={{ width: '100%', height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408', boxSizing: 'border-box' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreorderStepsEditor({ label, description, value, onChange }: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let items: { text: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 3) items.push({ text: '' });

  const update = (idx: number, v: string) => {
    const next = items.map((item, i) => i === idx ? { text: v } : item);
    onChange(JSON.stringify(next.slice(0, 3)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 12, overflow: 'hidden' }}>
        {items.slice(0, 3).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F0EBE5', gap: 8 }}>
            <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: '#9C8E7E', flexShrink: 0 }}>{idx + 1}.</span>
            <input value={item.text} onChange={(e) => update(idx, e.target.value)} placeholder="Step description"
              style={{ flex: 1, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FooterLinksEditor({ label, description, value, onChange }: {
  label: string; description?: string; value: string; onChange: (v: string) => void;
}) {
  let items: { label: string; url: string }[] = [];
  try { items = JSON.parse(value || '[]'); } catch { /* empty */ }
  while (items.length < 2) items.push({ label: '', url: '' });

  const update = (idx: number, field: string, v: string) => {
    const next = items.map((item, i) => i === idx ? { ...item, [field]: v } : item);
    onChange(JSON.stringify(next));
  };

  const addRow = () => onChange(JSON.stringify([...items, { label: '', url: '' }]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{label}</label>
      {description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={item.label} onChange={(e) => update(idx, 'label', e.target.value)} placeholder="Label"
              style={{ flex: 1, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <input value={item.url} onChange={(e) => update(idx, 'url', e.target.value)} placeholder="/privacy"
              style={{ flex: 1, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
          </div>
        ))}
        <button type="button" onClick={addRow} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: '#D4813A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          + Add link
        </button>
      </div>
    </div>
  );
}

function CategoriesEditor({ label, description, value, onChange, triggerUpload }: {
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input value={item.icon} onChange={(e) => update(idx, 'icon', e.target.value)} placeholder="🥐" title="Emoji icon"
                style={{ width: 40, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', textAlign: 'center', fontSize: 18, fontFamily: 'inherit', outline: 'none', flexShrink: 0 }} />
              <input value={item.label} onChange={(e) => update(idx, 'label', e.target.value)} placeholder="Label tag"
                style={{ flex: 1, minWidth: 80, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
              <input value={item.name} onChange={(e) => update(idx, 'name', e.target.value)} placeholder="Card title"
                style={{ flex: 2, minWidth: 100, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
              <input value={item.link} onChange={(e) => update(idx, 'link', e.target.value)} placeholder="/menu" title="Link URL"
                style={{ width: 80, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#1C1408', flexShrink: 0 }} />
            </div>
            <input value={item.hook} onChange={(e) => update(idx, 'hook', e.target.value)} placeholder="Short hook text shown on the card"
              style={{ height: 32, borderRadius: 8, border: '1px solid #E8E0D8', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1C1408' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.image_url ? (
                <img src={item.image_url} alt="cat" style={{ height: 36, width: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #E8E0D8', flexShrink: 0 }} />
              ) : (
                <div style={{ height: 36, width: 56, borderRadius: 6, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E', fontSize: 10, flexShrink: 0 }}>no img</div>
              )}
              <Button variant="secondary" size="sm" icon={<Upload size={13} />}
                onClick={() => triggerUpload(`cat_${idx + 1}_image`, (url) => update(idx, 'image_url', url))}>Upload</Button>
              <input value={item.image_url} onChange={(e) => update(idx, 'image_url', e.target.value)} placeholder="/images/cafe/photo.jpg"
                style={{ flex: 1, minWidth: 140, height: 32, borderRadius: 8, border: '1px solid #E8E0D8', background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: '#6B5D4F' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WebsiteSettings() {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<SiteSettingsGroup>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
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
    // Validate JSON-typed settings BEFORE shipping them to the server.
    // Pre-fix the JSON editors silently fell back to `{}` on bad input
    // and the form would happily POST the broken value, wiping the
    // hero/category data and only producing an obscure 422 if the
    // server schema rejected it.
    const jsonInvalid: string[] = [];
    for (const item of Object.values(settings ?? {}).flat()) {
      if (item.type !== 'json') continue;
      const raw = form[item.key];
      if (raw === undefined || raw === '' || raw === null) continue;
      try { JSON.parse(raw); }
      catch { jsonInvalid.push(item.label ?? item.key); }
    }
    if (jsonInvalid.length) {
      error(`Invalid JSON in: ${jsonInvalid.join(', ')}. Fix before saving.`);
      return;
    }

    setSaving(true);
    try { await updateSiteSettings(form); success('Settings saved successfully'); }
    catch { error('Failed to save settings'); }
    finally { setSaving(false); }
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
      if (uploadCallback) { uploadCallback.fn(url); }
      else { setForm((f) => ({ ...f, [uploadKey]: url })); }
      success('Image uploaded successfully');
    } catch { error('Upload failed'); }
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

  const groups = Object.keys(settings).filter((g) => !WEBSITE_OPS_GROUPS.has(g.toLowerCase()));
  const tabs = groups.length > 0 ? groups : ['General', 'Branding', 'Footer', 'Social', 'SEO'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        padding: '12px 14px', borderRadius: 12, background: '#FFF7ED', border: '1px solid #F5D0A9',
        fontSize: 13, color: '#1C1408', lineHeight: 1.45,
      }}>
        Prefer <a href="/admin/#/content-studio" style={{ color: '#D4813A', fontWeight: 700 }}>Content Studio</a> for
        shared vs per-app website/order-app marketing copy. This legacy editor still saves shared values.
      </div>
      <Tabs active={activeTab} onChange={setActiveTab}>
        <TabList>
          {tabs.map((g) => <Tab key={g} id={g.toLowerCase()}>{g}</Tab>)}
        </TabList>

        {tabs.map((group) => (
          <TabPanel key={group} id={group.toLowerCase()}>
            <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680 }}>
              {(settings[group] ?? []).map((item) => {
                if (item.type === 'image') {
                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{item.label}</label>
                      {item.description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{item.description}</p>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {form[item.key] ? (
                          <img src={form[item.key]} alt={item.label} style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, border: '1px solid #E8E0D8', padding: 4, background: '#fff' }} />
                        ) : (
                          <div style={{ width: 64, height: 64, borderRadius: 10, border: '1.5px dashed #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8E7E' }}>
                            <Upload size={20} />
                          </div>
                        )}
                        <Button variant="secondary" size="sm" icon={<Upload size={14} />}
                          onClick={() => { setUploadKey(item.key); setUploadCallback(null); fileInputRef.current?.click(); }}>
                          Upload
                        </Button>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'color') {
                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{item.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input type="color" value={form[item.key] ?? '#000000'} onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))}
                          style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #E8E0D8', cursor: 'pointer', padding: 2 }} />
                        <Input value={form[item.key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))} placeholder="#D4813A" className="max-w-[160px]" />
                      </div>
                    </div>
                  );
                }

                if (item.type === 'boolean') {
                  return (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F0EBE5' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1408', margin: 0 }}>{item.label}</p>
                        {item.description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: '2px 0 0' }}>{item.description}</p>}
                      </div>
                      <Toggle checked={form[item.key] === 'true'} onChange={(v) => setForm((f) => ({ ...f, [item.key]: String(v) }))} />
                    </div>
                  );
                }

                if (item.type === 'json' && item.key.toLowerCase().includes('hour')) {
                  return <BusinessHoursEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} />;
                }

                if (item.type === 'json' && /^hero_slide_\d$/.test(item.key)) {
                  const slideNum = item.key.replace('hero_slide_', '');
                  return <HeroSlideEditor key={item.key} label={item.label} description={item.description ?? undefined} uploadKey={`hero_${slideNum}_image`} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} triggerUpload={triggerUpload} />;
                }

                if (item.type === 'json' && item.key === 'trust_items') {
                  return <TrustItemsEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} />;
                }

                if (item.type === 'json' && item.key === 'proof_details') {
                  return <ProofDetailsEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} />;
                }

                if (item.type === 'json' && item.key === 'homepage_categories') {
                  return <CategoriesEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} triggerUpload={triggerUpload} />;
                }

                if (item.type === 'json' && item.key === 'about_values') {
                  return <AboutValuesEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} />;
                }

                if (item.type === 'json' && item.key === 'preorder_confirm_steps') {
                  return <PreorderStepsEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} />;
                }

                if (item.type === 'json' && item.key === 'footer_links') {
                  return <FooterLinksEditor key={item.key} label={item.label} description={item.description ?? undefined} value={form[item.key] ?? ''} onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))} />;
                }

                if (item.type === 'textarea' || item.type === 'json') {
                  return (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1C1408' }}>{item.label}</label>
                      {item.description && <p style={{ fontSize: 12, color: '#9C8E7E', margin: 0 }}>{item.description}</p>}
                      <textarea value={form[item.key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))} rows={item.type === 'json' ? 6 : 3}
                        style={{ width: '100%', borderRadius: 10, border: '1.5px solid #E8E0D8', background: '#fff', padding: '10px 12px', fontSize: 13, fontFamily: 'monospace', outline: 'none', resize: 'vertical', color: '#1C1408', boxSizing: 'border-box' }} />
                    </div>
                  );
                }

                return (
                  <Input key={item.key} label={item.label} helper={item.description ?? undefined} value={form[item.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.value }))} />
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <Button variant="primary" icon={<Save size={15} />} onClick={handleSave} loading={saving}>Save Changes</Button>
              </div>
            </div>
          </TabPanel>
        ))}
      </Tabs>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
    </div>
  );
}
