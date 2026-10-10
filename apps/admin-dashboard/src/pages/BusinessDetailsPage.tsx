import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Image as ImageIcon, Upload } from 'lucide-react';
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
import { uploadContentImage } from '../api/content';
import type { MediaAsset } from '../api/media';
import { ScopeMismatchNotices, type ScopeMismatch } from '../components/ScopeMismatchNotices';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ui';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * Pictures the server keeps in their own shape (BrandImages, 2026-10-10):
 * the logos whole and see-through, the tab icon on a clear square, the link
 * preview at 1200 × 630. Each gets an Upload button that sends the file as
 * it is, and a pick from the Media Library previews the full picture.
 */
const BRAND_PICTURE_KEYS = new Set(['logo', 'logo_dark', 'favicon', 'og_image']);

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

/*
 * Settings audit, 2026-10-09 (owner: "minimizing vertical scrolling as much
 * as possible"): the nine sections were one page, 10,700px on a phone, each
 * field followed by a block of "Used by" chips. The sections are tabs now,
 * every button on screen at once and wrapping on a phone (owner, 2026-08-15:
 * all section buttons visible, none off the edge), and "Used by" is one line.
 * The tab is in the address (?section=), so a link can open one.
 */
const TAB_LABELS: Record<string, string> = {
  identity: 'Identity',
  contact: 'Contact',
  address: 'Address',
  brand: 'Brand',
  social: 'Social',
  tracking: 'Tracking',
  menu_rules: 'Menu rules',
  hours: 'Hours',
  legal: 'Legal & tax',
};

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
  /** Which brand picture is uploading. */
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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

  const uploadBrandPicture = async (key: string, file: File) => {
    setUploadingKey(key);
    try {
      const res = await uploadContentImage(key, 'shared', file);
      setDrafts((d) => ({ ...d, [key]: res.url }));
      setSaveStatus((st) => (st === 'saved' ? 'idle' : st));
      success('Picture ready. Press Save to use it.');
    } catch (e) {
      error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingKey(null);
    }
  };

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
          : 'Saved';

  // One field, one place. The API no longer repeats a key across sections,
  // but the screen refuses to draw the same setting twice regardless — two
  // boxes holding one value is a bug the owner has to spot, and he already
  // did once.
  const drawn = new Set<string>();
  const drawnSections = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((f) => {
        if (drawn.has(f.key)) return false;
        drawn.add(f.key);
        return true;
      }),
    }))
    .filter((section) => section.fields.length > 0);

  const tabs = [
    ...drawnSections.map((section) => ({ id: section.id, title: section.title })),
    ...(hours ? [{ id: 'hours', title: 'Hours and closures' }] : []),
    ...(legal ? [{ id: 'legal', title: 'Legal, tax and document identity' }] : []),
  ];
  const wanted = searchParams.get('section');
  const active = tabs.find((t) => t.id === wanted)?.id ?? tabs[0]?.id ?? null;
  const pickTab = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', id);
      return next;
    }, { replace: true });
  };

  const dirtyKeys = new Set(dirty.map((f) => f.key));
  const tabState = (id: string): 'error' | 'dirty' | null => {
    const section = drawnSections.find((x) => x.id === id);
    if (!section) return null;
    if (section.fields.some((f) => fieldErrors[f.key])) return 'error';
    if (section.fields.some((f) => dirtyKeys.has(f.key))) return 'dirty';
    return null;
  };

  // A refused save names its fields; open the tab that holds the first one.
  useEffect(() => {
    const firstKey = Object.keys(fieldErrors)[0];
    if (!firstKey) return;
    const home = drawnSections.find((section) => section.fields.some((f) => f.key === firstKey));
    if (home && home.id !== active) pickTab(home.id);
  }, [fieldErrors]);

  return (
    <PageShell>
      <div data-testid="business-details-page" className="business-details-page" style={pageStyle}>
        <PageHeader
          section="System"
          title="Business Details"
          subtitle="Shared operational business record"
        />

        <p data-testid="business-details-notice" className="business-details-notice">
          {notice || 'These values appear on invoices, printed receipts, signage and SMS — not Website or Order App marketing content.'}
        </p>

        {!loading ? <ScopeMismatchNotices mismatches={mismatches} /> : null}

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        ) : (
          <form
            ref={formRef}
            data-testid="business-details-form"
            onSubmit={onSubmit}
            className="business-details-form"
          >
            <div className="business-details-bar">
              {tabs.length > 1 ? (
                <div
                  className="business-details-tabs"
                  role="tablist"
                  aria-label="Section"
                  data-testid="business-details-jump"
                >
                  {tabs.map((t) => {
                    const state = tabState(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`business-tab-${t.id}`}
                        aria-selected={active === t.id}
                        aria-controls={`business-section-${t.id}`}
                        className="business-details-tab"
                        title={t.title}
                        onClick={() => pickTab(t.id)}
                      >
                        {TAB_LABELS[t.id] ?? t.title}
                        {state ? (
                          <span
                            className={`business-details-tab-dot business-details-tab-dot--${state}`}
                            aria-label={state === 'error' ? 'needs a fix' : 'unsaved changes'}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="business-details-status-row">
                <span
                  data-testid="business-details-save-status"
                  role="status"
                  aria-live="polite"
                  className={`business-details-status${saveStatus === 'failed' ? ' business-details-status--failed' : ''}${saveStatus === 'saved' && !isDirty ? ' business-details-status--ok' : ''}`}
                >
                  {saveStatus === 'saving' && 'Saving…'}
                  {saveStatus === 'saved' && !isDirty && 'Saved'}
                  {saveStatus === 'failed' && (
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span>Save failed — Retry</span>
                      {saveError ? <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{saveError}</span> : null}
                      <Btn variant="secondary" small type="button" onClick={() => void save()} data-testid="business-details-retry">
                        Retry
                      </Btn>
                    </span>
                  )}
                  {saveStatus === 'idle' && isDirty && `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}`}
                  {saveStatus === 'idle' && !isDirty && 'No unsaved changes'}
                </span>
                {saveStatus !== 'failed' ? (
                  // The form's submit button, so Enter in a field saves.
                  <Btn
                    variant="primary"
                    small
                    type="submit"
                    disabled={saveStatus === 'saving' || !isDirty}
                    data-testid="business-details-save"
                  >
                    {saveLabel}
                  </Btn>
                ) : null}
              </div>
            </div>

            {drawnSections.map((section) => (
              <section
                key={section.id}
                id={`business-section-${section.id}`}
                data-testid={`business-section-${section.id}`}
                className="business-details-card"
                role="tabpanel"
                aria-labelledby={`business-tab-${section.id}`}
                hidden={tabs.length > 1 && active !== section.id}
              >
                <header className="business-details-card-head">
                  <h2 style={sectionTitleStyle}>{section.title}</h2>
                  {section.description ? (
                    <p style={sectionDescStyle}>{section.description}</p>
                  ) : null}
                </header>
                <div className="business-details-grid">
                  {section.fields.map((field) => (
                    <FieldEditor
                      key={`${section.id}-${field.key}`}
                      field={field}
                      value={drafts[field.key] ?? ''}
                      error={fieldErrors[field.key]}
                      onChange={(v) => {
                        setDrafts((d) => ({ ...d, [field.key]: v }));
                        setSaveStatus((st) => (st === 'saved' ? 'idle' : st));
                        setFieldErrors((prev) => {
                          if (!prev[field.key]) return prev;
                          const next = { ...prev };
                          delete next[field.key];
                          return next;
                        });
                      }}
                      mismatches={mismatches}
                      onPickImage={() => setPickerKey(field.key)}
                      onUploadImage={BRAND_PICTURE_KEYS.has(field.key)
                        ? (file) => void uploadBrandPicture(field.key, file)
                        : undefined}
                      uploading={uploadingKey === field.key}
                    />
                  ))}
                </div>
              </section>
            ))}

            <HoursSection hours={hours} hidden={tabs.length > 1 && active !== 'hours'} />
            <LegalSection legal={legal} hidden={tabs.length > 1 && active !== 'legal'} />
          </form>
        )}

        {/* Save follows you down the page: on a phone it floats above the tab
            bar, so a long section never sends you back up for it. */}
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
            // A brand picture is redrawn from the full-size master on Save;
            // preview that, not the 4:3 menu crop.
            const url = BRAND_PICTURE_KEYS.has(key) ? (asset.original_url || asset.url) : asset.url;
            setDrafts((d) => ({ ...d, [key]: url }));
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
  onUploadImage,
  uploading = false,
}: {
  field: BusinessDetailsField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  mismatches: ScopeMismatch[];
  onPickImage?: () => void;
  /** Brand pictures only: send a file to be drawn in the slot's own shape. */
  onUploadImage?: (file: File) => void;
  uploading?: boolean;
}) {
  const keyboard = keyboardFor(field);
  const isSquarePreview = field.key === 'favicon' || field.key === 'default_item_image';
  const uploadRef = useRef<HTMLInputElement>(null);

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
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#b74b0c'}
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
            className={`business-details-image-preview${isSquarePreview ? ' business-details-image-preview--square' : ''}${field.key === 'logo_dark' ? ' business-details-image-preview--dark' : ''}`}
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
              {onUploadImage ? (
                <>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg"
                    hidden
                    data-testid={`business-image-file-${field.key}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) onUploadImage(file);
                    }}
                  />
                  <Btn
                    type="button"
                    variant="secondary"
                    small
                    disabled={uploading}
                    onClick={() => uploadRef.current?.click()}
                    data-testid={`business-image-upload-${field.key}`}
                  >
                    <Upload size={14} aria-hidden /> {uploading ? 'Uploading…' : 'Upload'}
                  </Btn>
                </>
              ) : null}
              <Btn
                type="button"
                variant="secondary"
                small
                onClick={onPickImage}
                data-testid={`business-image-pick-${field.key}`}
              >
                <ImageIcon size={14} aria-hidden /> Choose picture
              </Btn>
              {value ? (
                <Btn
                  type="button"
                  variant="secondary"
                  small
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
        // One quiet line: as a block of chips under every field it was most
        // of the page (settings audit, 2026-10-09).
        <span data-testid={`business-used-by-${field.key}`} className="business-details-used-by">
          <span className="business-details-used-by-label">Used by</span> {field.used_by.join(' · ')}
        </span>
      ) : null}
      <ScopeMismatchNotices mismatches={mismatches} onlyKey={field.key} />
    </label>
  );
}

function HoursSection({ hours, hidden }: { hours: BusinessDetailsHours | null; hidden?: boolean }) {
  if (!hours) return null;
  return (
    <section
      id="business-section-hours"
      data-testid="business-section-hours"
      className="business-details-card"
      role="tabpanel"
      aria-labelledby="business-tab-hours"
      hidden={hidden}
    >
      <header className="business-details-card-head">
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

function LegalSection({ legal, hidden }: { legal: BusinessDetailsLegal | null; hidden?: boolean }) {
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
    <section
      id="business-section-legal"
      data-testid="business-section-legal"
      className="business-details-card"
      role="tabpanel"
      aria-labelledby="business-tab-legal"
      hidden={hidden}
    >
      <header className="business-details-card-head">
        <h2 style={sectionTitleStyle}>Legal, tax and document identity</h2>
        <p style={sectionDescStyle}>{legal.note}</p>
      </header>
      <dl data-testid="business-legal-fields" className="business-details-legal">
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
