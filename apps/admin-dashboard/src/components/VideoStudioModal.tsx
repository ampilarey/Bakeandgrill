import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Film } from 'lucide-react';
import { Modal, Button } from './ui';
import {
  getVideoStudioCapabilities,
  probeVideo,
  processVideo,
  type VideoAspect,
  type VideoProcessResult,
} from '../api';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Public /storage/… URL of the source video */
  sourceUrl: string;
  /** Optional media library id */
  mediaId?: number;
  onExported: (result: VideoProcessResult) => void;
};

const ASPECTS: Array<{ value: VideoAspect; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: '16:9', label: '16:9' },
  { value: '4:5', label: '4:5 hero' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
];

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Trim / crop-aspect / poster / export studio for hero + media library videos. */
export function VideoStudioModal({ open, onClose, sourceUrl, mediaId, onExported }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ffmpeg, setFfmpeg] = useState<boolean | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [posterAt, setPosterAt] = useState(0);
  const [aspect, setAspect] = useState<VideoAspect>('original');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [metaLabel, setMetaLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setBusy(false);
    void getVideoStudioCapabilities()
      .then((c) => setFfmpeg(c.ffmpeg))
      .catch(() => setFfmpeg(false));

    void probeVideo(mediaId ? { media_id: mediaId } : { source_url: sourceUrl })
      .then((p) => {
        setDuration(p.duration);
        setTrimStart(0);
        setTrimEnd(p.duration);
        setPosterAt(Math.min(0.5, p.duration / 2));
        setMetaLabel(`${p.width}×${p.height} · ${fmt(p.duration)} · ${p.codec || 'video'}`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not probe video');
      });
  }, [open, sourceUrl, mediaId]);

  const seekTo = (t: number) => {
    const el = videoRef.current;
    if (el) {
      el.currentTime = Math.max(0, Math.min(duration || el.duration || 0, t));
    }
  };

  const exportClip = async () => {
    if (!ffmpeg) {
      setError('FFmpeg is not available on this server.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await processVideo({
        ...(mediaId ? { media_id: mediaId } : { source_url: sourceUrl }),
        trim_start: trimStart,
        trim_end: trimEnd,
        aspect,
        poster_at: posterAt,
        register_library: true,
      });
      onExported(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Video studio"
      size="xl"
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => void exportClip()}
            disabled={busy || ffmpeg === false || !sourceUrl}
            icon={<Clapperboard size={14} />}
          >
            {busy ? 'Exporting…' : 'Export muted MP4'}
          </Button>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Trim, crop to hero aspect, pick a poster frame, then export. Output is muted H.264 for the banner.
          {metaLabel ? ` · Source: ${metaLabel}` : ''}
        </p>

        {ffmpeg === false ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-danger-strong)', background: 'var(--color-danger-bg)', padding: 10, borderRadius: 8 }}>
            FFmpeg is not installed on this server. Ask hosting to install <code>ffmpeg</code> and <code>ffprobe</code>.
          </p>
        ) : null}

        <div
          style={{
            background: 'var(--color-text)',
            borderRadius: 12,
            overflow: 'hidden',
            aspectRatio: aspect === 'original' ? '16 / 9' : aspect.replace(':', ' / '),
            maxHeight: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {sourceUrl ? (
            <video
              ref={videoRef}
              src={sourceUrl}
              controls
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Film size={40} color="var(--color-text-muted)" />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Trim start ({fmt(trimStart)})
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.05}
              value={trimStart}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTrimStart(Math.min(v, trimEnd - 0.2));
                seekTo(v);
              }}
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Trim end ({fmt(trimEnd)})
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.05}
              value={trimEnd}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTrimEnd(Math.max(v, trimStart + 0.2));
                seekTo(v);
              }}
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </label>
        </div>

        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Poster frame ({fmt(posterAt)})
          <input
            type="range"
            min={trimStart}
            max={Math.max(trimStart + 0.05, trimEnd)}
            step={0.05}
            value={Math.min(trimEnd, Math.max(trimStart, posterAt))}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPosterAt(v);
              seekTo(v);
            }}
            style={{ accentColor: 'var(--color-primary)' }}
          />
        </label>

        <div>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Crop aspect</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ASPECTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAspect(a.value)}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: aspect === a.value ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: aspect === a.value ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: 'var(--color-text)',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-strong)' }}>{error}</p>
        ) : null}
      </div>
    </Modal>
  );
}
