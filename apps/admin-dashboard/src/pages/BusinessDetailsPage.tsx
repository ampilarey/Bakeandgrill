import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { ApiRequestError } from '@shared/api';
import {
  getBusinessDetails,
  updateBusinessDetails,
  type BusinessDetailsField,
  type BusinessDetailsHours,
  type BusinessDetailsLegal,
  type BusinessDetailsSection,
} from '../api/businessDetails';
import { PageHeader, PageShell, Btn } from '../components/SharedUI';
import { MediaPicker } from '../components/MediaPicker';
import type { MediaAsset } from '../api/media';
import { ScopeMismatchNotices, type ScopeMismatch } from '../components/ScopeMismatchNotices';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ui';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

function applyResponse(
  res: Awaited<ReturnType<typeof getBusinessDetails>>,
  setFields: (f: BusinessDetailsField[]) => void,
  setSections: (s: BusinessDetailsSection[]) => void,
  setHours: (h: BusinessDetailsHours | null) => void,
  setLegal: (l: BusinessDetailsLegal | null) => void,
  setNotice: (n: string) => void,
  setMismatches: (m: ScopeMismatch[]) => void,
  setDrafts: (d: Record<string, string>) => void,
) {
  setFields(res.fields);
  setSections(res.sections ?? []);
  setHours(res.hours ?? null);
  setLegal(res.legal ?? null);
  setNotice(res.notice);
  setMismatches(res.mismatches ?? []);
  const next: Record<string, string> = {};
  for (const f of res.fields) {
    next[f.key] = f.value ?? '';
  }
  setDrafts(next);
}

function fieldErrorsFromBody(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!body || typeof body !== 'object') return out;
  const errors = (body as { errors?: Record<string, string[]> }).errors;
  if (!errors) return out;
  for (const [key, messages] of Object.entries(errors)) {
    const msg = messages?.[0];
    if (!msg) continue;
    if (key.includes('.')) {
      // changes.N.value — skip; prefer bare field keys from the API
      continue;
    }
    out[key] = msg;
  }
  return out;
}

export function BusinessDetailsPage() {
  usePageTitle('Business Details');
  const { success, error } = useToast();
  const [fields, setFields] = useState<BusinessDetailsField[]>([]);
  const [sections, setSections] = useState<BusinessDetailsSection[]>([]);
  const [hours, setHours] = useState<BusinessDetailsHours | null>(null);
  const [legal, setLegal] = useState<BusinessDetailsLegal | null>(null);
  const [notice, setNotice] = useState('');
  const [mismatches, setMismatches] = useState<ScopeMismatch[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Which image field the Media Library is picking for. */
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getBusinessDetails();
      applyResponse(res, setFields, setSections, setHours, setLegal, setNotice, setMismatches, setDrafts);
      setFieldErrors({});
      setSaveStatus('idle');
      setSaveError(null);
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
  const isDirty = dirty.length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const save = async () => {
    if (dirty.length === 0) return;
    setSaveStatus('saving');
    setSaveError(null);
    setFieldErrors({});
    try {
      const res = await updateBusinessDetails(
        dirty.map((f) => ({ key: f.key, value: drafts[f.key] ?? '' })),
      );
      applyResponse(res, setFields, setSections, setHours, setLegal, setNotice, setMismatches, setDrafts);
      setSaveStatus('saved');
      success('Business record saved');
    } catch (e) {
      // Keep drafts — do not reset form values on failure.
      const msg = e instanceof Error ? e.message : 'Save failed';
      setSaveStatus('failed');
      setSaveError(msg);
      if (e instanceof ApiRequestError) {
        setFieldErrors(fieldErrorsFromBody(e.body));
      }
      error(msg);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save();
  };

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'failed'
        ? 'Save failed — Retry'
        : isDirty
          ? `Save ${dirty.length} change${dirty.length === 1 ? '' : 's'}`
          : saveStatus === 'saved'
            ? 'Saved'
            : 'Saved';

  return (
    <PageShell>
      <div data-testid="business-details-page" className="business-details-page" style={pageStyle}>
        <PageHeader
          section="System"
          title="Business Details"
          subtitle="Shared operational business record"
          action={(
            <Btn
              variant="primary"
              onClick={() => void save()}
              disabled={saveStatus === 'saving' || (!isDirty && saveStatus !== 'failed')}
              data-testid="business-details-save"
            >
              {saveLabel}
            </Btn>
          )}
        />

        <div
          data-testid="business-details-notice"
          style={noticeStyle}
        >
          {notice || 'These values appear on invoices, printed receipts, signage and SMS — not Website or Order App marketing content.'}
        </div>

        <div
          data-testid="business-details-save-status"
          role="status"
          aria-live="polite"
          style={{
            ...statusBarStyle,
            ...(saveStatus === 'failed' ? statusFailedStyle : null),
            ...(saveStatus === 'saved' && !isDirty ? statusOkStyle : null),
          }}
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && !isDirty && 'Saved'}
          {saveStatus === 'failed' && (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span>Save failed — Retry</span>
              {saveError ? <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{saveError}</span> : null}
              <Btn variant="secondary" onClick={() => void save()} data-testid="business-details-retry">
                Retry
              </Btn>
            </span>
          )}
          {saveStatus === 'idle' && isDirty && `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}`}
          {saveStatus === 'idle' && !isDirty && !loading && 'No unsaved changes'}
        </div>

        {!loading ? <ScopeMismatchNotices mismatches={mismatches} /> : null}

        {!loading && sections.length > 1 ? (
          <nav className="business-details-jump" aria-label="Jump to a section" data-testid="business-details-jump">
            {sections.map((section) => (
              <a key={section.id} href={`#business-section-${section.id}`} className="business-details-jump-link">
                {section.title}
              </a>
            ))}
          </nav>
        ) : null}

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : (
          <form
            ref={formRef}
            data-testid="business-details-form"
            onSubmit={onSubmit}
            className="business-details-form"
          >
            {(() => {
              // One field, one place. The API no longer repeats a key across
              // sections, but the screen refuses to draw the same setting
              // twice regardless — two boxes holding one value is a bug the
              // owner has to spot, and he already did once.
              const drawn = new Set<string>();
              return sections.map((section) => {
                const fieldsToDraw = section.fields.filter((f) => {
                  if (drawn.has(f.key)) return false;
                  drawn.add(f.key);
                  return true;
                });
                if (fieldsToDraw.length === 0) return null;
                return (
              <section
                key={section.id}
                id={`business-section-${section.id}`}
                data-testid={`business-section-${section.id}`}
                className="business-details-card"
              >
                <header style={{ marginBottom: 12 }}>
                  <h2 style={sectionTitleStyle}>{section.title}</h2>
                  {section.description ? (
                    <p style={sectionDescStyle}>{section.description}</p>
                  ) : null}
                </header>
                <div className="business-details-grid">
                  {fieldsToDraw.map((field) => (
                    <FieldEditor
                      key={`${section.id}-${field.key}`}
                      field={field}
                      value={drafts[field.key] ?? ''}
                      error={fieldErrors[field.key]}
                      onChange={(v) => {
                        setDrafts((d) => ({ ...d, [field.key]: v }));
                        setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
                        setFieldErrors((prev) => {
                          if (!prev[field.key]) return prev;
                          const next = { ...prev };
                          delete next[field.key];
                          return next;
                        });
                      }}
                      mismatches={mismatches}
                      onPickImage={() => setPickerKey(field.key)}
                    />
                  ))}
                </div>
              </section>
                );
              });
            })()}

            <HoursSection hours={hours} />
            <LegalSection legal={legal} />

            {/* Kept for keyboard submit and for anyone who scrolls to the end. */}
            <div className="business-details-foot">
              <Btn
                variant="primary"
                type="submit"
                disabled={saveStatus === 'saving' || (!isDirty && saveStatus !== 'failed')}
                data-testid="business-details-save-bottom"
              >
                {saveLabel}
              </Btn>
              {saveStatus === 'failed' ? (
                <span style={{ color: 'var(--color-danger)', fontSize: 14 }}>Save failed — Retry</span>
              ) : null}
            </div>
          </form>
        )}

        {/* Save follows you down the page. With 25 fields and eight sections,
            a button pinned to the top of a phone screen is a button you have
            to scroll back up to find. */}
        {isDirty || saveStatus === 'failed' ? (
          <div className="business-details-savebar" data-testid="business-details-savebar">
            <span className="business-details-savebar-text">
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'failed'
                  ? 'Save failed'
                  : `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}`}
            </span>
            <Btn
              variant="primary"
              onClick={() => void save()}
              disabled={saveStatus === 'saving'}
              data-testid="business-details-save-sticky"
            >
              {saveLabel}
            </Btn>
          </div>
        ) : null}

        <MediaPicker
          open={pickerKey !== null}
          onClose={() => setPickerKey(null)}
          mediaType="image"
          title="Pick a picture"
          onPick={(asset: MediaAsset) => {
            const key = pickerKey;
            setPickerKey(null);
            if (!key) return;
            setDrafts((d) => ({ ...d, [key]: asset.url }));
            setSaveStatus((st) => (st === 'saved' ? 'idle' : st));
          }}
        />
      </div>
    </PageShell>
  );
}

/**
 * Phone keyboards, chosen per field.
 *
 * Typing a phone number on a phone should raise the number pad, not the
 * alphabet. Same for an email or a web address — small change, felt on every
 * single edit made from behind the counter.
 */
function keyboardFor(field: BusinessDetailsField): {
  type: string;
  inputMode?: 'text' | 'tel' | 'email' | 'url' | 'numeric';
  autoComplete?: string;
} {
  const key = field.key;
  if (key.includes('email')) return { type: 'email', inputMode: 'email', autoComplete: 'email' };
  if (/phone|whatsapp|viber/.test(key)) return { type: 'tel', inputMode: 'tel', autoComplete: 'tel' };
  if (/website|maps_url|maps_embed|social_/.test(key)) return { type: 'url', inputMode: 'url', autoComplete: 'url' };
  if (field.type === 'number' || key === 'menu_new_days') return { type: 'text', inputMode: 'numeric' };
  return { type: 'text' };
}

/** Fields that need the whole row rather than half of it. */
function isWideField(field: BusinessDetailsField): boolean {
  return field.type === 'textarea' || field.type === 'image' || field.key === 'business_address';
}

function FieldEditor({
  field,
  value,
  error,
  onChange,
  mismatches,
  onPickImage,
}: {
  field: BusinessDetailsField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  mismatches: ScopeMismatch[];
  onPickImage?: () => void;
}) {
  const keyboard = keyboardFor(field);
  const isSquarePreview = field.key === 'favicon' || field.key === 'default_item_image';

  return (
    <label
      className={`business-details-field${isWideField(field) ? ' business-details-field--wide' : ''}`}
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, ...(error ? inputErrorStyle : null) }}
          aria-invalid={Boolean(error)}
        />
      ) : field.type === 'boolean' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value === 'true' || value === '1'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            data-testid={`business-toggle-${field.key}`}
          />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {value === 'true' || value === '1' ? 'On' : 'Off'}
          </span>
        </label>
      ) : field.type === 'color' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#d4813a'}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${field.label} colour picker`}
            data-testid={`business-color-${field.key}`}
            style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', cursor: 'pointer' }}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputStyle, ...(error ? inputErrorStyle : null), flex: 1, minWidth: 0 }}
            aria-invalid={Boolean(error)}
          />
        </div>
      ) : field.type === 'image' ? (
        <div className="business-details-image">
          <span
            className={`business-details-image-preview${isSquarePreview ? ' business-details-image-preview--square' : ''}`}
            data-testid={`business-image-slot-${field.key}`}
          >
            {value ? (
              <img
                src={value}
                alt=""
                data-testid={`business-image-preview-${field.key}`}
              />
            ) : (
              <span className="business-details-image-empty">Not set</span>
            )}
          </span>
          <span className="business-details-image-controls">
            <input
              type="url"
              inputMode="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="/storage/…"
              style={{ ...inputStyle, ...(error ? inputErrorStyle : null) }}
              aria-invalid={Boolean(error)}
            />
            <span className="business-details-image-actions">
              <Btn
                type="button"
                variant="secondary"
                onClick={onPickImage}
                data-testid={`business-image-pick-${field.key}`}
              >
                <ImageIcon size={14} aria-hidden /> Choose picture
              </Btn>
              {value ? (
                <Btn
                  type="button"
                  variant="secondary"
                  onClick={() => onChange('')}
                  data-testid={`business-image-clear-${field.key}`}
                >
                  Remove
                </Btn>
              ) : null}
            </span>
          </span>
        </div>
      ) : (
        <input
          type={keyboard.type}
          inputMode={keyboard.inputMode}
          autoComplete={keyboard.autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, ...(error ? inputErrorStyle : null) }}
          aria-invalid={Boolean(error)}
        />
      )}
      {error ? (
        <span data-testid={`business-field-error-${field.key}`} style={errorTextStyle}>
          {error}
        </span>
      ) : null}
      {field.used_by && field.used_by.length > 0 ? (
        <div data-testid={`business-used-by-${field.key}`} style={usedByWrapStyle}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Used by
          </span>
          <ul style={usedByListStyle}>
            {field.used_by.map((item) => (
              <li key={item} style={usedByItemStyle}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ScopeMismatchNotices mismatches={mismatches} onlyKey={field.key} />
    </label>
  );
}

function HoursSection({ hours }: { hours: BusinessDetailsHours | null }) {
  if (!hours) return null;
  return (
    <section data-testid="business-section-hours" style={cardStyle}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={sectionTitleStyle}>Hours and closures</h2>
        <p style={sectionDescStyle}>{hours.note}</p>
      </header>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text)' }}>
        Status:{' '}
        <strong>{hours.open_now ? 'Open now' : 'Closed now'}</strong>
        {hours.ramadan_hours_active ? ' · Ramadan / overnight schedule appears active' : null}
      </p>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const }}>
        <table data-testid="business-hours-weekly" style={tableStyle}>
          <tbody>
            {hours.weekly.map((row) => (
              <tr key={row.day}>
                <th scope="row" style={thStyle}>{row.day}</th>
                <td style={tdStyle}>{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hours.closures.length > 0 ? (
        <div data-testid="business-hours-closures" style={{ marginTop: 16 }}>
          <h3 style={{ ...sectionTitleStyle, fontSize: 15, marginBottom: 8 }}>Temporary / special closures</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text)', fontSize: 14, lineHeight: 1.5 }}>
            {hours.closures.map((c) => (
              <li key={c.date}>
                <strong>{c.date}</strong>
                {c.reason ? ` — ${c.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
          No temporary closures on file.
        </p>
      )}
      <p style={{ margin: '16px 0 0', fontSize: 14 }}>
        Manage the operational schedule in{' '}
        <Link to={hours.editor_path.replace(/^\/admin/, '') || '/online-ordering'} data-testid="business-hours-editor-link">
          {hours.editor_label}
        </Link>
        .
      </p>
    </section>
  );
}

function LegalSection({ legal }: { legal: BusinessDetailsLegal | null }) {
  if (!legal) return null;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Seller / legal name', value: legal.seller_name || '—' },
    { label: 'Seller / legal address', value: legal.seller_address || '—' },
    { label: 'TIN', value: legal.seller_tin || '—' },
    { label: 'Taxable activity number', value: legal.taxable_activity_no || '—' },
    { label: 'GST registration', value: legal.gst_registered ? 'Registered' : 'Not registered' },
    { label: 'Receipt / invoice business name', value: legal.receipt_name || '—' },
    { label: 'Receipt phone', value: legal.receipt_phone || '—' },
    { label: 'Receipt email', value: legal.receipt_email || '—' },
    { label: 'Receipt address', value: legal.receipt_address || '—' },
  ];

  return (
    <section data-testid="business-section-legal" style={cardStyle}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={sectionTitleStyle}>Legal, tax and document identity</h2>
        <p style={sectionDescStyle}>{legal.note}</p>
      </header>
      <dl data-testid="business-legal-fields" style={{ display: 'grid', gap: 12, margin: 0 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ minWidth: 0 }}>
            <dt style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 2 }}>
              {row.label}
            </dt>
            <dd style={{ margin: 0, fontSize: 14, color: 'var(--color-text)', wordBreak: 'break-word' }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: '16px 0 0', fontSize: 14 }}>
        Edit legal/tax identity in{' '}
        <Link to={legal.editor_path.replace(/^\/admin/, '') || '/gst'} data-testid="business-legal-editor-link">
          {legal.editor_label}
        </Link>
        {' '}(authoritative source: {legal.source}). Receipt contact lines above follow the shared fields on this page.
      </p>
    </section>
  );
}

const pageStyle: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  overflowX: 'hidden',
};

const noticeStyle: CSSProperties = {
  marginBottom: 12,
  padding: '14px 16px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-border-light)',
  color: 'var(--color-text)',
  lineHeight: 1.5,
  maxWidth: 880,
  boxSizing: 'border-box',
};

const statusBarStyle: CSSProperties = {
  marginBottom: 16,
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  color: 'var(--color-text-secondary)',
  maxWidth: 880,
  boxSizing: 'border-box',
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
};

const statusFailedStyle: CSSProperties = {
  borderColor: 'var(--color-danger)',
  color: 'var(--color-danger)',
  background: 'var(--color-border-light)',
};

const statusOkStyle: CSSProperties = {
  borderColor: 'var(--color-success)',
  color: 'var(--color-success)',
};

const cardStyle: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  boxSizing: 'border-box',
  minWidth: 0,
  width: '100%',
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const sectionDescStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--color-text-muted)',
};

const inputStyle: CSSProperties = {
  minHeight: 44,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontFamily: 'inherit',
  fontSize: 14,
};

const inputErrorStyle: CSSProperties = {
  borderColor: 'var(--color-danger)',
};

const errorTextStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-danger)',
};

const usedByWrapStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
};

const usedByListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const usedByItemStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-border-light)',
  color: 'var(--color-text-secondary)',
  maxWidth: '100%',
  wordBreak: 'break-word',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px 8px 0',
  fontWeight: 600,
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};

const tdStyle: CSSProperties = {
  padding: '8px 0',
  color: 'var(--color-text-secondary)',
};

export default BusinessDetailsPage;
