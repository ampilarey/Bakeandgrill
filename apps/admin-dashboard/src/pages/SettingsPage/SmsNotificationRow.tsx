import { useEffect, useState, type CSSProperties } from 'react';
import { previewSmsTemplateById, updateSmsTemplate, type SmsTemplate } from '../../api';
import { smsCharCount } from '../../utils/smsCharCount';

type TemplateVariable = { name: string; description?: string };

type Props = {
  toggleKey: string;
  label: string;
  desc: string;
  emoji: string;
  enabled: boolean;
  toggleDisabled?: boolean;
  savingToggle?: boolean;
  onToggle: () => void;
  template?: SmsTemplate | null;
  templateLabel?: string;
  onTemplateSaved?: (template: SmsTemplate) => void;
};

export function SmsNotificationRow({
  toggleKey,
  label,
  desc,
  emoji,
  enabled,
  toggleDisabled = false,
  savingToggle = false,
  onToggle,
  template,
  templateLabel,
  onTemplateSaved,
}: Props) {
  const [body, setBody] = useState(template?.body ?? '');
  const [savingBody, setSavingBody] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState('');

  useEffect(() => {
    setBody(template?.body ?? '');
    setPreview(null);
  }, [template?.id, template?.body]);

  const displayBody = body || template?.body || '';
  const count = smsCharCount(displayBody);
  const variables = (template?.variables ?? []) as TemplateVariable[];

  const handleSaveBody = async () => {
    if (!template) return;
    setSavingBody(true);
    setBodyError('');
    try {
      const res = await updateSmsTemplate(template.id, { body: displayBody });
      onTemplateSaved?.(res.template);
      setBody(res.template.body);
    } catch (e: unknown) {
      setBodyError((e as Error).message);
    } finally {
      setSavingBody(false);
    }
  };

  const handlePreview = async () => {
    if (!template) return;
    try {
      const res = await previewSmsTemplateById(template.id);
      setPreview(res.preview);
    } catch {
      setPreview(displayBody);
    }
  };

  const editor = template ? (
    <div style={{ borderTop: toggleDisabled ? 'none' : '1px solid #F3EDE6', paddingTop: toggleDisabled ? 0 : 12 }}>
      {templateLabel && (
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#6B5A4E' }}>
          Message: {templateLabel}
        </p>
      )}
      <textarea
        value={body || template.body}
        onChange={(e) => {
          setBody(e.target.value);
          setPreview(null);
        }}
        rows={4}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #E8E0D8',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      {variables.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {variables.map((v) => (
            <span
              key={v.name}
              title={v.description}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 99,
                background: '#F5F0EB',
                color: '#6B5A4E',
                fontFamily: 'monospace',
              }}
            >
              {`{{${v.name}}}`}
            </span>
          ))}
        </div>
      )}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#9C8E7E' }}>
          {count.encoding} · {count.chars} chars · {count.segments} segment{count.segments === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void handlePreview()} style={secondaryBtn}>
            Preview
          </button>
          <button type="button" onClick={() => void handleSaveBody()} disabled={savingBody} style={primaryBtn}>
            {savingBody ? 'Saving…' : 'Save message'}
          </button>
        </div>
      </div>
      {preview && (
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          background: '#F9FAFB',
          borderRadius: 8,
          fontSize: 12,
          color: '#374151',
          whiteSpace: 'pre-wrap',
        }}>
          {preview}
        </div>
      )}
      {bodyError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{bodyError}</p>}
    </div>
  ) : null;

  if (toggleDisabled && template) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #E8E0D8',
        borderRadius: 10,
        padding: '12px 16px',
      }}>
        {editor}
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E8E0D8',
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{emoji}</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#3D2B1F' }}>{label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9C8E7E' }}>{desc}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={toggleDisabled || savingToggle}
          title={enabled ? 'Click to disable' : 'Click to enable'}
          aria-label={`Toggle ${label}`}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: 'none',
            cursor: toggleDisabled || savingToggle ? 'not-allowed' : 'pointer',
            background: enabled ? '#D4813A' : '#D1D5DB',
            transition: 'background 0.2s',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute',
            top: 3,
            left: enabled ? 22 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }} />
        </button>
      </div>
      {editor}
      <span style={{ display: 'none' }} data-toggle-key={toggleKey} />
    </div>
  );
}

const primaryBtn: CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: '#D4813A',
  color: '#fff',
};

const secondaryBtn: CSSProperties = {
  border: '1px solid #E8E0D8',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: '#fff',
  color: '#3D2B1F',
};
