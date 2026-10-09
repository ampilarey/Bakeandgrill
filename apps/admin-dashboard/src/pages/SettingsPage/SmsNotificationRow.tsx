import { useEffect, useState } from 'react';
import { previewSmsTemplateById, updateSmsTemplate, type SmsTemplate } from '../../api';
import { smsCharCount } from '../../utils/smsCharCount';
import type { LucideIcon } from 'lucide-react';
import { Btn, Switch } from '../../components/SharedUI';

type TemplateVariable = { name: string; description?: string };

export type NotificationMessage = {
  template: SmsTemplate | null;
  /** Which message this is when a switch sends more than one, e.g. "Pickup ready". */
  label?: string;
};

type Props = {
  toggleKey: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  enabled: boolean;
  /** The switch shows but cannot be pressed (its saved value did not load). */
  switchLocked?: boolean;
  savingToggle?: boolean;
  onToggle: () => void;
  /** The texts this switch sends, each folded to one line until Edit. */
  messages?: NotificationMessage[];
  onTemplateSaved?: (template: SmsTemplate) => void;
};

/*
 * One customer SMS: its switch, and the wording of each text it sends.
 * Settings audit, 2026-10-09 (owner: "minimizing vertical scrolling as much
 * as possible"): every wording box stood open, thirteen of them, and the tab
 * ran to 6,000px on a phone. Each is one line now, the start of the message,
 * and Edit opens the box. A switch that sends two texts (receipt at the
 * counter and online; pickup ready and delivery packed) shows both under it
 * instead of a second card with no switch.
 */
export function SmsNotificationRow({
  toggleKey,
  label,
  desc,
  icon: Icon,
  enabled,
  switchLocked = false,
  savingToggle = false,
  onToggle,
  messages = [],
  onTemplateSaved,
}: Props) {
  const shown = messages.filter((m): m is { template: SmsTemplate; label?: string } => m.template !== null);
  return (
    <div
      data-toggle-key={toggleKey}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Icon size={20} aria-hidden style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>{desc}</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={() => onToggle()}
          disabled={switchLocked || savingToggle}
          title={enabled ? 'Click to disable' : 'Click to enable'}
          aria-label={`Toggle ${label}`}
        />
      </div>
      {shown.map((m) => (
        <MessageEditor
          key={m.template.id}
          template={m.template}
          label={m.label}
          onSaved={onTemplateSaved}
        />
      ))}
    </div>
  );
}

function MessageEditor({
  template,
  label,
  onSaved,
}: {
  template: SmsTemplate;
  label?: string;
  onSaved?: (template: SmsTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(template.body ?? '');
  const [savingBody, setSavingBody] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState('');

  useEffect(() => {
    setBody(template.body ?? '');
    setPreview(null);
  }, [template.id, template.body]);

  const displayBody = body || template.body || '';
  const edited = displayBody !== (template.body ?? '');
  const count = smsCharCount(displayBody);
  const variables = (template.variables ?? []) as TemplateVariable[];
  const title = label ? `Message: ${label}` : 'Message';

  const handleSaveBody = async () => {
    setSavingBody(true);
    setBodyError('');
    try {
      const res = await updateSmsTemplate(template.id, { body: displayBody });
      onSaved?.(res.template);
      setBody(res.template.body);
      setOpen(false);
    } catch (e: unknown) {
      setBodyError((e as Error).message);
    } finally {
      setSavingBody(false);
    }
  };

  const handlePreview = async () => {
    try {
      const res = await previewSmsTemplateById(template.id);
      setPreview(res.preview);
    } catch {
      setPreview(displayBody);
    }
  };

  if (!open) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: '2px 10px',
          paddingTop: 10,
          borderTop: '1px solid var(--color-border-light)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {title}
          {edited && <span style={{ color: 'var(--color-tone-rust-text)' }}> · not saved</span>}
        </span>
        <Btn
          variant="secondary"
          small
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${title.toLowerCase()}`}
          style={{ gridRow: 'span 2' }}
        >
          Edit
        </Btn>
        <span
          title={displayBody}
          style={{
            fontSize: 13,
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayBody || 'No wording yet'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 10 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{title}</p>
      <textarea
        value={displayBody}
        aria-label={title}
        onChange={(e) => {
          setBody(e.target.value);
          setPreview(null);
        }}
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
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
                background: 'var(--color-tone-brown-bg)',
                color: 'var(--color-tone-brown-text)',
                fontFamily: 'monospace',
              }}
            >
              {`{{${v.name}}}`}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {count.encoding} · {count.chars} chars · {count.segments} segment{count.segments === 1 ? '' : 's'}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="ghost" small type="button" onClick={() => setOpen(false)}>
            Done
          </Btn>
          <Btn variant="secondary" small type="button" onClick={() => void handlePreview()}>
            Preview
          </Btn>
          <Btn variant="primary" small type="button" onClick={() => void handleSaveBody()} disabled={savingBody || !edited}>
            {savingBody ? 'Saving…' : 'Save message'}
          </Btn>
        </div>
      </div>
      {preview && (
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          background: 'var(--color-bg)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--color-text)',
          whiteSpace: 'pre-wrap',
        }}>
          {preview}
        </div>
      )}
      {bodyError && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-strong)' }}>{bodyError}</p>}
    </div>
  );
}
