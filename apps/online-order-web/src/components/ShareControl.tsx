import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { API_BASE_URL } from '../api';

export type ShareControlProps = {
  url: string;
  title: string;
  text?: string;
  /** Accessible name when a page carries several Share buttons ("Share Drinks"). */
  ariaLabel?: string;
  /** What this is, so the share can be counted (owner, 2026-09-24). Nothing personal is sent. */
  itemId?: number;
  categoryId?: number;
};

export type ShareChannel = 'native' | 'copy' | 'whatsapp' | 'telegram' | 'viber' | 'facebook' | 'x';

/** Fire-and-forget beacon to /api/share-events; counting never breaks sharing. */
export function reportShare(channel: ShareChannel, ref: { itemId?: number; categoryId?: number }): void {
  if (!ref.itemId && !ref.categoryId) return;
  try {
    void fetch(`${API_BASE_URL}/share-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ item_id: ref.itemId ?? null, category_id: ref.categoryId ?? null, channel, surface: 'order' }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch {
    // nothing
  }
}

/**
 * Native share on a user click; otherwise a popover with Copy link
 * (Clipboard API, then a select-and-copy field) and encoded intent URLs.
 * Each share is reported once so the Social Hub can show what gets shared.
 */
export function ShareControl({ url, title, text, ariaLabel, itemId, categoryId }: ShareControlProps) {
  const shareText = text ?? title;
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setShowFallback(false);
    setStatus(null);
    openBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const pop = popoverRef.current;
      if (!pop) return;
      const items = Array.from(
        pop.querySelectorAll<HTMLElement>('button, a, input'),
      ).filter((el) => !el.hidden && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey, true);
    const first = popoverRef.current?.querySelector<HTMLElement>('button, a, input');
    first?.focus();

    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(shareText);

  const ref = { itemId, categoryId };
  const onOpen = () => {
    const payload = { title, text: shareText, url };
    if (typeof navigator.share === 'function') {
      navigator.share(payload).then(() => reportShare('native', ref)).catch(() => {});
      return;
    }
    setOpen((was) => !was);
  };

  const onCopy = async () => {
    const showSelectFallback = () => {
      setShowFallback(true);
      setStatus('Select and copy the link');
      requestAnimationFrame(() => {
        fallbackInputRef.current?.focus();
        fallbackInputRef.current?.select();
      });
    };
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setStatus('Link copied');
        reportShare('copy', ref);
        return;
      } catch {
        showSelectFallback();
        return;
      }
    }
    showSelectFallback();
  };

  return (
    <div className="share-control" ref={rootRef} data-share-root>
      <button
        ref={openBtnRef}
        type="button"
        className="share-control-btn"
        aria-label={ariaLabel}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        data-testid="share-open"
      >
        Share
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        className="share-popover"
        role="dialog"
        aria-label="Share this page"
        hidden={!open}
        data-share-popover
        data-share-url={url}
        data-share-title={title}
        data-share-text={shareText}
      >
        <button
          type="button"
          className="share-copy"
          onClick={onCopy}
          data-share-copy
          data-testid="share-copy"
        >
          Copy link
        </button>
        <label className="share-fallback-label" hidden={!showFallback} data-share-fallback-wrap>
          Link
          <input
            ref={fallbackInputRef}
            className="share-fallback-input"
            type="text"
            readOnly
            value={url}
            data-share-fallback
            data-testid="share-fallback-input"
          />
        </label>
        {status ? (
          <p className="share-copy-status" data-share-status>
            {status}
          </p>
        ) : null}
        <ul className="share-intents">
          <li>
            <a href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`} rel="noopener noreferrer" target="_blank" onClick={() => reportShare('whatsapp', ref)}>
              WhatsApp
            </a>
          </li>
          <li>
            <a href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} rel="noopener noreferrer" target="_blank" onClick={() => reportShare('telegram', ref)}>
              Telegram
            </a>
          </li>
          <li>
            <a href={`viber://forward?text=${encodedText}%20${encodedUrl}`} onClick={() => reportShare('viber', ref)}>Viber</a>
          </li>
          <li>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} rel="noopener noreferrer" target="_blank" onClick={() => reportShare('facebook', ref)}>
              Facebook
            </a>
          </li>
          <li>
            <a href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`} rel="noopener noreferrer" target="_blank" onClick={() => reportShare('x', ref)}>
              X
            </a>
          </li>
        </ul>
        <button type="button" className="share-close" onClick={close} data-share-close>
          Close
        </button>
      </div>
    </div>
  );
}
