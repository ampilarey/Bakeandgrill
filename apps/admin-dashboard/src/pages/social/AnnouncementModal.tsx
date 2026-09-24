import { useEffect, useState } from 'react';
import {
  createAnnouncement, fetchAnnouncementTemplates, fetchSocialChannelOptions,
  type AnnouncementTemplate, type SocialChannelOption, type SocialPlatformCaps,
} from '../../api';
import { Btn, ErrorMsg, Input, Modal, ModalActions, Select, Spinner } from '../../components/SharedUI';
import { PLATFORM_LABELS, fromLocalDateTimeInput } from './composer';

const TV_DURATIONS = [
  { value: '30', label: '30 minutes' },
  { value: '120', label: '2 hours' },
  { value: 'today', label: 'Until midnight' },
  { value: '1440', label: '1 day' },
  { value: '4320', label: '3 days' },
  { value: '10080', label: '1 week' },
  { value: '0', label: 'Until removed' },
];

/**
 * One announcement, two places (owner's shortlist, 2026-09-24): the social
 * channels and the TV board's notice line. Starter texts come from the
 * server filled with the real hours and closures; the owner edits a
 * sentence, ticks where it goes, and it is posted and up on the board in
 * one go. Instagram is dropped for a text-only post and said so.
 */
export function AnnouncementModal({ onClose, onSaved, canCompose, canSchedule, canPublish, canSignage }: {
  onClose: () => void;
  onSaved: (message: string) => void;
  canCompose: boolean;
  canSchedule: boolean;
  canPublish: boolean;
  canSignage: boolean;
}) {
  const [templates, setTemplates] = useState<AnnouncementTemplate[] | null>(null);
  const [channels, setChannels] = useState<SocialChannelOption[]>([]);
  const [platforms, setPlatforms] = useState<Record<string, SocialPlatformCaps>>({});
  const [templateKey, setTemplateKey] = useState<string>('');
  const [text, setText] = useState('');
  const [textDv, setTextDv] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [tv, setTv] = useState(canSignage);
  const [look, setLook] = useState('info');
  const [show, setShow] = useState('both');
  const [duration, setDuration] = useState('1440');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchAnnouncementTemplates(), fetchSocialChannelOptions()])
      .then(([t, ch]) => {
        setTemplates(t.templates);
        setChannels(ch.channels);
        setPlatforms(ch.platforms);
        // Text-capable channels are ticked by default; a photo-only one is not.
        setSelected(ch.channels.filter((c) => !ch.platforms[c.platform]?.requires_photo).map((c) => c.id));
      })
      .catch((e: Error) => { setError(e.message); setTemplates([]); });
  }, []);

  const pickTemplate = (t: AnnouncementTemplate) => {
    setTemplateKey(t.key);
    setText(t.text);
    setLook(t.look);
    setDuration(String(t.minutes >= 10080 ? 10080 : t.minutes >= 4320 ? 4320 : t.minutes >= 1440 ? 1440 : t.minutes >= 120 ? 120 : t.minutes > 0 ? 30 : 0));
  };

  const minutes = () => {
    if (duration === 'today') {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(23, 59, 0, 0);
      return Math.max(30, Math.round((midnight.getTime() - now.getTime()) / 60000));
    }
    return Number(duration);
  };

  const submit = async (action: 'draft' | 'schedule' | 'now') => {
    setSaving(true);
    setError('');
    try {
      const res = await createAnnouncement({
        text,
        text_dv: textDv,
        template: templateKey || null,
        channel_ids: selected,
        action,
        scheduled_at: action === 'schedule' ? fromLocalDateTimeInput(scheduledAt) : null,
        signage: { enabled: tv, look, show, seconds: 10, minutes: minutes() },
      });
      const parts: string[] = [];
      if (res.post_id) parts.push(action === 'now' ? 'Posted to the channels.' : action === 'schedule' ? 'Scheduled for the channels.' : 'Saved as a draft.');
      if (res.notice) parts.push('Up on the TV board.');
      if (res.skipped_channels.length > 0) parts.push(`Skipped ${res.skipped_channels.join(', ')} (needs a photo).`);
      onSaved(parts.join(' '));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const nothingChosen = selected.length === 0 && !tv;
  const disabled = saving || text.trim() === '' || nothingChosen;
  const socialChosen = selected.length > 0;
  const scheduleReady = !disabled && socialChosen && fromLocalDateTimeInput(scheduledAt) !== null;

  return (
    <Modal
      title="New announcement"
      onClose={onClose}
      maxWidth={640}
      footer={(
        <ModalActions>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Close</Btn>
          {canCompose && socialChosen && (
            <Btn variant="secondary" disabled={disabled} onClick={() => { void submit('draft'); }}>Save draft</Btn>
          )}
          {canSchedule && socialChosen && (
            <Btn variant="secondary" disabled={!scheduleReady} onClick={() => { void submit('schedule'); }}>Schedule</Btn>
          )}
          {(canPublish || (!socialChosen && tv)) && (
            <Btn disabled={disabled} onClick={() => { void submit('now'); }}>
              {socialChosen && tv ? 'Post & show on TV' : socialChosen ? 'Post now' : 'Show on TV'}
            </Btn>
          )}
        </ModalActions>
      )}
    >
      {templates === null ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 14 }}>
          {error && <ErrorMsg message={error} />}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Start from</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={templateKey === t.key}
                  onClick={() => pickTemplate(t)}
                  style={{
                    minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    fontWeight: templateKey === t.key ? 700 : 500,
                    border: templateKey === t.key ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: templateKey === t.key ? 'var(--color-warning-bg)' : 'var(--color-bg)', color: 'var(--color-text)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Message</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              aria-label="Announcement"
              placeholder="We're closed today…"
              style={{
                width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box',
                border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ދިވެހި <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional; shown under the English on both)</span></div>
            <textarea
              value={textDv}
              onChange={(e) => setTextDv(e.target.value)}
              rows={2}
              dir="rtl"
              aria-label="Announcement in Dhivehi"
              style={{
                width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
                border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Social channels</div>
            {channels.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>No enabled channels.</p>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {channels.map((c) => {
                  const photoOnly = Boolean(platforms[c.platform]?.requires_photo);
                  return (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: photoOnly ? 'default' : 'pointer', opacity: photoOnly ? 0.6 : 1 }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        disabled={photoOnly}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                      />
                      {PLATFORM_LABELS[c.platform] ?? c.platform} — {c.name}{photoOnly && ' (needs a photo)'}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {canSignage && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={tv} onChange={(e) => setTv(e.target.checked)} />
                Also show on the TV board
              </label>
              {tv && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Select
                    label="Look"
                    aria-label="Look"
                    options={[{ value: 'info', label: 'Notice' }, { value: 'warning', label: 'Please note' }, { value: 'celebrate', label: 'Celebrate' }]}
                    value={look}
                    onChange={setLook}
                    style={{ minWidth: 140 }}
                  />
                  <Select
                    label="Show as"
                    aria-label="Show as"
                    options={[{ value: 'both', label: 'Slide and ticker' }, { value: 'slide', label: 'Slide only' }, { value: 'ticker', label: 'Ticker only' }]}
                    value={show}
                    onChange={setShow}
                    style={{ minWidth: 160 }}
                  />
                  <Select
                    label="For"
                    aria-label="For"
                    options={TV_DURATIONS}
                    value={duration}
                    onChange={setDuration}
                    style={{ minWidth: 140 }}
                  />
                </div>
              )}
              {tv && text.length > 160 && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>The TV line takes the first 160 characters.</p>
              )}
            </div>
          )}

          {canSchedule && socialChosen && (
            <Input
              label="Schedule the post for (your local time)"
              type="datetime-local"
              value={scheduledAt}
              onChange={(v: string) => setScheduledAt(v)}
              style={{ maxWidth: 260 }}
            />
          )}
          {nothingChosen && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-danger)' }}>Pick at least one channel or the TV board.</p>}
        </div>
      )}
    </Modal>
  );
}
