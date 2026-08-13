import { useEffect, useState, type CSSProperties } from 'react';
import { getBusinessDetails, updateBusinessDetails, type BusinessDetailsField } from '../api/businessDetails';
import { PageHeader, PageShell, Btn } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ui';

export function BusinessDetailsPage() {
  usePageTitle('Business Details');
  const { success, error } = useToast();
  const [fields, setFields] = useState<BusinessDetailsField[]>([]);
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getBusinessDetails();
      setFields(res.fields);
      setNotice(res.notice);
      const next: Record<string, string> = {};
      for (const f of res.fields) {
        next[f.key] = f.value ?? '';
      }
      setDrafts(next);
    } catch (e) {
      error(e instanceof Error ? e.message : 'Failed to load business details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = fields.filter((f) => (drafts[f.key] ?? '') !== (f.value ?? ''));

  const save = async () => {
    if (dirty.length === 0) return;
    setSaving(true);
    try {
      const res = await updateBusinessDetails(
        dirty.map((f) => ({ key: f.key, value: drafts[f.key] ?? '' })),
      );
      setFields(res.fields);
      setNotice(res.notice);
      const next: Record<string, string> = {};
      for (const f of res.fields) {
        next[f.key] = f.value ?? '';
      }
      setDrafts(next);
      success('Business record saved');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Business Details"
        subtitle="Invoice & receipt record"
        actions={(
          <Btn variant="primary" onClick={() => void save()} disabled={saving || dirty.length === 0}>
            {saving ? 'Saving…' : dirty.length ? `Save ${dirty.length}` : 'Saved'}
          </Btn>
        )}
      />

      <div
        data-testid="business-details-notice"
        style={{
          marginBottom: 20,
          padding: '14px 16px',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          background: 'var(--color-border-light)',
          color: 'var(--color-text)',
          lineHeight: 1.5,
          maxWidth: 720,
        }}
      >
        {notice || 'These values appear on invoices, printed receipts, signage and SMS — not on the website or order app.'}
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : (
        <div
          data-testid="business-details-form"
          style={{ display: 'grid', gap: 16, maxWidth: 720 }}
        >
          {fields.map((field) => (
            <label
              key={field.key}
              style={{ display: 'grid', gap: 6 }}
              data-testid={`business-field-${field.key}`}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                {field.label}
              </span>
              {field.description ? (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{field.description}</span>
              ) : null}
              {field.type === 'textarea' ? (
                <textarea
                  value={drafts[field.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field.key]: e.target.value }))}
                  rows={3}
                  style={inputStyle}
                />
              ) : (
                <input
                  type="text"
                  value={drafts[field.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [field.key]: e.target.value }))}
                  style={inputStyle}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </PageShell>
  );
}

const inputStyle: CSSProperties = {
  minHeight: 44,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  fontSize: 14,
};

export default BusinessDetailsPage;
