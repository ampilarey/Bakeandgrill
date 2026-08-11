import { useEffect, useState } from 'react';
import { MediaPicker } from '../../components/MediaPicker';
import type { MediaAsset } from '../../api/media';
import type { PageBlockRow } from '../../api/pageBlocks';

/** Block types whose content is edited right here, in the layout builder. */
export const GENERIC_BLOCK_TYPES = [
  'rich_text',
  'image',
  'image_text',
  'button_band',
  'divider',
  'video',
  'faq_list',
] as const;

export type GenericBlockType = (typeof GENERIC_BLOCK_TYPES)[number];

export function isGenericBlockType(type: string): type is GenericBlockType {
  return (GENERIC_BLOCK_TYPES as readonly string[]).includes(type);
}

export type BlockSettings = Record<string, unknown>;

type FaqItem = { question: string; answer: string };

function text(settings: BlockSettings, key: string): string {
  const value = settings[key];
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function faqItems(settings: BlockSettings): FaqItem[] {
  const raw = settings.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    return {
      question: typeof item.question === 'string' ? item.question : '',
      answer: typeof item.answer === 'string' ? item.answer : '',
    };
  });
}

/**
 * Content form for one generic block. Everything the owner types lives in the
 * block's `settings`, so a single PUT saves the whole form.
 */
export function GenericBlockSettingsForm({
  block,
  busy,
  onSave,
}: {
  block: PageBlockRow;
  busy: boolean;
  onSave: (settings: BlockSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<BlockSettings>(block.settings ?? {});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(
    block.media?.image?.thumb || block.media?.image?.url || block.media?.video?.poster_url || null,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(block.settings ?? {});
  }, [block.id, block.settings]);

  const set = (key: string, value: unknown) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...draft };
      // A half-filled question would be rejected by the server; an untouched
      // "Add a question" row should just disappear instead.
      if (block.block_type === 'faq_list') {
        payload.items = faqItems(draft).filter(
          (item) => item.question.trim() !== '' || item.answer.trim() !== '',
        );
      }
      await onSave(payload);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const type = block.block_type;
  const wantsVideo = type === 'video';
  const disabled = busy || saving;

  const mediaField = (
    <div style={fieldWrap}>
      <label style={labelStyle}>{wantsVideo ? 'Video' : 'Picture'}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {preview && (
          <img
            src={preview}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }}
          />
        )}
        <button type="button" disabled={disabled} onClick={() => setPickerOpen(true)} style={btnSmall}>
          {draft.media_id ? 'Change' : 'Choose from library'}
        </button>
        {draft.media_id ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              set('media_id', null);
              setPreview(null);
            }}
            style={{ ...btnSmall, color: 'var(--color-danger)' }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div data-testid={`home-layout-settings-${type}`} style={formWrap}>
      {type === 'rich_text' && (
        <>
          <TextField label="Heading" value={text(draft, 'heading')} disabled={disabled} onChange={(v) => set('heading', v)} />
          <TextArea label="Text" value={text(draft, 'body')} disabled={disabled} onChange={(v) => set('body', v)} />
        </>
      )}

      {type === 'image' && (
        <>
          {mediaField}
          <TextField label="Caption" value={text(draft, 'caption')} disabled={disabled} onChange={(v) => set('caption', v)} />
          <TextField
            label="Alt text (for screen readers)"
            value={text(draft, 'alt')}
            disabled={disabled}
            onChange={(v) => set('alt', v)}
          />
        </>
      )}

      {type === 'image_text' && (
        <>
          {mediaField}
          <div style={fieldWrap}>
            <label style={labelStyle}>Picture side</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  disabled={disabled}
                  data-testid={`home-layout-side-${side}`}
                  onClick={() => set('side', side)}
                  style={{
                    ...btnSmall,
                    background:
                      (text(draft, 'side') || 'left') === side ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: (text(draft, 'side') || 'left') === side ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                  }}
                >
                  {side === 'left' ? 'Picture left' : 'Picture right'}
                </button>
              ))}
            </div>
          </div>
          <TextField label="Heading" value={text(draft, 'heading')} disabled={disabled} onChange={(v) => set('heading', v)} />
          <TextArea label="Text" value={text(draft, 'body')} disabled={disabled} onChange={(v) => set('body', v)} />
          <TextField label="Caption" value={text(draft, 'caption')} disabled={disabled} onChange={(v) => set('caption', v)} />
          <TextField label="Alt text" value={text(draft, 'alt')} disabled={disabled} onChange={(v) => set('alt', v)} />
        </>
      )}

      {type === 'button_band' && (
        <>
          <TextArea label="Text" value={text(draft, 'text')} disabled={disabled} onChange={(v) => set('text', v)} rows={2} />
          <TextField
            label="First button label"
            value={text(draft, 'button1_label')}
            disabled={disabled}
            onChange={(v) => set('button1_label', v)}
          />
          <TextField
            label="First button link"
            value={text(draft, 'button1_url')}
            disabled={disabled}
            placeholder="/order/menu"
            onChange={(v) => set('button1_url', v)}
          />
          <TextField
            label="Second button label"
            value={text(draft, 'button2_label')}
            disabled={disabled}
            onChange={(v) => set('button2_label', v)}
          />
          <TextField
            label="Second button link"
            value={text(draft, 'button2_url')}
            disabled={disabled}
            placeholder="/contact"
            onChange={(v) => set('button2_url', v)}
          />
        </>
      )}

      {type === 'divider' && (
        <>
          <SelectField
            label="Style"
            value={text(draft, 'style') || 'spacer'}
            disabled={disabled}
            options={[
              { value: 'spacer', label: 'Blank space' },
              { value: 'rule', label: 'Thin line' },
            ]}
            onChange={(v) => set('style', v)}
          />
          <SelectField
            label="Size"
            value={text(draft, 'size') || 'md'}
            disabled={disabled}
            options={[
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
            ]}
            onChange={(v) => set('size', v)}
          />
        </>
      )}

      {type === 'video' && (
        <>
          {mediaField}
          <TextField label="Caption" value={text(draft, 'caption')} disabled={disabled} onChange={(v) => set('caption', v)} />
        </>
      )}

      {type === 'faq_list' && (
        <FaqEditor
          items={faqItems(draft)}
          disabled={disabled}
          onChange={(items) => set('items', items)}
        />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void save()}
          data-testid={`home-layout-save-settings-${type}`}
          style={btnSave}
        >
          {saving ? 'Saving…' : 'Save content'}
        </button>
        {saved && <span style={{ fontSize: 11, color: 'var(--color-success)' }}>Saved.</span>}
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaType={wantsVideo ? 'video' : 'image'}
        title={wantsVideo ? 'Pick a video' : 'Pick a picture'}
        onPick={(asset: MediaAsset) => {
          set('media_id', asset.id);
          setPreview(asset.thumb_url || asset.url);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function FaqEditor({
  items,
  disabled,
  onChange,
}: {
  items: FaqItem[];
  disabled: boolean;
  onChange: (items: FaqItem[]) => void;
}) {
  const patch = (index: number, key: keyof FaqItem, value: string) => {
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>Questions &amp; answers</label>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 8,
            marginBottom: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <input
            value={item.question}
            disabled={disabled}
            placeholder="Question"
            onChange={(e) => patch(index, 'question', e.target.value)}
            style={inputStyle}
          />
          <textarea
            value={item.answer}
            disabled={disabled}
            placeholder="Answer"
            rows={3}
            onChange={(e) => patch(index, 'answer', e.target.value)}
            style={{ ...inputStyle, minHeight: 64, padding: 8, resize: 'vertical' }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            style={{ ...btnSmall, alignSelf: 'flex-start', color: 'var(--color-danger)' }}
          >
            Remove question
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled || items.length >= 40}
        onClick={() => onChange([...items, { question: '', answer: '' }])}
        style={btnSmall}
      >
        Add a question
      </button>
    </div>
  );
}

function TextField({
  label,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  disabled,
  rows = 4,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        disabled={disabled}
        rows={rows}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, minHeight: 80, padding: 8, resize: 'vertical' }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

const formWrap: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: '1px dashed var(--color-border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const fieldWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
};

const inputStyle: React.CSSProperties = {
  minHeight: 40,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  padding: '0 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  width: '100%',
  boxSizing: 'border-box',
};

const btnSmall: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSave: React.CSSProperties = {
  ...btnSmall,
  background: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  color: 'var(--color-bg)',
  minHeight: 36,
};
