import { useState } from 'react';
import { FOLD_AT, PLATFORM_SHORT } from './composer';

/**
 * How a post will roughly look on one platform: the page name, the
 * caption folded where Facebook and Instagram fold it, the photo in the
 * platform's crop, and Facebook's link card when there is a link but no
 * photo. A sketch, not the platform's CSS — enough to catch a caption
 * that reads badly or a photo that crops the food out.
 */
export function PostPreview({ platform, channelName, caption, imageUrl, linkUrl, imageCount = 1, video = false }: {
  platform: string;
  channelName: string;
  caption: string;
  imageUrl: string | null;
  linkUrl: string | null;
  /** More than one means a carousel: the first photo with a "1/N" pill. */
  imageCount?: number;
  /** The image is a video's poster: a play badge over it. */
  video?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const foldAt = FOLD_AT[platform];
  const chars = Array.from(caption);
  const folded = !expanded && foldAt !== undefined && chars.length > foldAt;
  const shown = folded ? chars.slice(0, foldAt).join('').trimEnd() : caption;
  const initial = (channelName.trim()[0] ?? 'B').toUpperCase();
  const aspect = platform === 'instagram' ? '1 / 1' : platform === 'telegram' || platform === 'viber' ? '16 / 10' : '4 / 3';
  const captionFirst = platform === 'facebook';
  const linkHost = linkUrl ? linkUrl.replace(/^https?:\/\//, '').split('/')[0] : '';

  const captionNode = caption.trim() !== '' && (
    <p style={{ margin: 0, padding: '8px 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--color-text)' }}>
      {platform === 'instagram' && <strong style={{ marginRight: 6 }}>{channelName}</strong>}
      {shown}
      {folded && (
        <>
          {'… '}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            See more
          </button>
        </>
      )}
    </p>
  );

  const imageNode = imageUrl ? (
    <div style={{ width: '100%', aspectRatio: video && platform === 'instagram' ? '9 / 16' : aspect, background: 'var(--color-bg)', overflow: 'hidden', position: 'relative' }}>
      <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {video && (
        <span
          data-testid="preview-video-badge"
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 44, color: 'var(--color-surface)', textShadow: '0 2px 12px rgba(0,0,0,0.6)', pointerEvents: 'none',
          }}
        >
          ▶
        </span>
      )}
      {imageCount > 1 && (
        <span
          data-testid="preview-carousel-pill"
          style={{
            position: 'absolute', top: 8, right: 8, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700,
            background: 'rgba(0,0,0,0.6)', color: 'var(--color-surface)',
          }}
        >
          1/{imageCount}
        </span>
      )}
    </div>
  ) : platform === 'facebook' && linkUrl ? (
    <div style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{linkHost}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Bake &amp; Grill</div>
    </div>
  ) : null;

  return (
    <div
      data-testid={`post-preview-${platform}`}
      style={{
        border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden',
        background: 'var(--color-surface)', fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <span style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--color-primary)', color: 'var(--color-surface)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
        }}>
          {initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelName}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Just now · {PLATFORM_SHORT[platform] ?? platform}</div>
        </div>
      </div>
      {captionFirst && captionNode}
      {imageNode}
      {!captionFirst && captionNode}
      {!captionNode && !imageNode && (
        <p style={{ margin: 0, padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>Nothing to show yet.</p>
      )}
    </div>
  );
}
