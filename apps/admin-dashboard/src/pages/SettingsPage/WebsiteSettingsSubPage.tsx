import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, LayoutTemplate, Smartphone, Trash2, Upload } from 'lucide-react';
import { getSiteSettings, updateSiteSettings, uploadSiteLogo } from '../../api';
import { useToast } from '../../components/ui';
import { Btn } from '../../components/SharedUI';

/**
 * Legacy Website Settings content editors moved to Content Studio.
 * Branding still hosts the Default item photo uploader here.
 */
export function WebsiteSettings() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSiteSettings();
      const branding = res.settings?.Branding ?? res.settings?.branding ?? [];
      const row = branding.find((r) => r.key === 'default_item_image');
      setUrl((row?.value ?? '').trim());
    } catch {
      setUrl('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const res = await uploadSiteLogo('default_item_image', file);
      setUrl(res.url);
      toast.success('Default item photo saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await updateSiteSettings({ default_item_image: '' });
      setUrl('');
      toast.success('Default item photo removed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div style={{
        padding: 24, borderRadius: 14, background: '#fff',
        border: '1px solid #E8E0D8', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1C1408', fontWeight: 700, fontSize: 16 }}>
          <ImageIcon size={18} /> Default item photo
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#6B5D4F', lineHeight: 1.5 }}>
          Shown for menu items that don&apos;t have their own photo.
        </p>
        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: '#9C8E7E' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              data-testid="default-item-image-preview"
              style={{
                width: 96, height: 96, borderRadius: '50%', overflow: 'hidden',
                background: 'linear-gradient(145deg, rgba(212,129,58,0.18), #F7E4C8)',
                border: '1px solid #E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {url ? (
                <img src={url} alt="Default item" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 12, color: '#9C8E7E', textAlign: 'center', padding: 8 }}>No photo</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                style={{ minHeight: 44 }}
              >
                <Upload size={14} /> {url ? 'Replace' : 'Upload'}
              </Btn>
              {url ? (
                <Btn type="button" variant="secondary" disabled={busy} onClick={() => void onRemove()} style={{ minHeight: 44 }}>
                  <Trash2 size={14} /> Remove
                </Btn>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              data-testid="default-item-image-input"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
          </div>
        )}
      </div>

      <div style={{
        padding: 24, borderRadius: 14, background: '#fff',
        border: '1px solid #E8E0D8', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1C1408', fontWeight: 700, fontSize: 16 }}>
          <LayoutTemplate size={18} /> Content editors
        </div>
        <p style={{ margin: 0, fontSize: 14, color: '#6B5D4F', lineHeight: 1.5 }}>
          Website and order-app marketing copy (hero slides, categories, trust items, branding, SEO, and more)
          are edited in separate editors — each app keeps its own values. Logo / favicon / OG also live under Branding in Content Studio.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            to="/content/website"
            style={{
              height: 44, padding: '0 16px', borderRadius: 10,
              background: '#D4813A', color: '#fff', fontWeight: 700, fontSize: 14,
              display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', fontFamily: 'inherit',
            }}
          >
            <LayoutTemplate size={16} /> Website Content
          </Link>
          <Link
            to="/content/order-app"
            style={{
              height: 44, padding: '0 16px', borderRadius: 10,
              background: '#F8F6F3', color: '#1C1408', fontWeight: 700, fontSize: 14,
              display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', fontFamily: 'inherit',
              border: '1px solid #E8E0D8',
            }}
          >
            <Smartphone size={16} /> Order App Content
          </Link>
        </div>
      </div>
    </div>
  );
}
