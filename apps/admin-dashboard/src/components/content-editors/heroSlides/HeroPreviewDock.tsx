import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Play } from 'lucide-react';

import { VisualBlockPreview } from '../VisualBlockPreview';

const STORAGE_KEY = 'hero-preview-dock-minimized';

type Props = {
  /** The slide being edited. Nothing renders without one. */
  slide: Record<string, unknown> | null;
  /** 1-based, for the dock's caption. */
  slideNumber?: number;
};

function readMinimized(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The hero preview, floating over the editor instead of sitting in the scroll.
 *
 * In the flow it pushed the controls down — on a phone it filled the screen
 * before a single field was reachable, and on a laptop it cost the same space
 * again on every slide. Floating keeps it visible while the settings scroll
 * underneath, which is the point of a preview.
 *
 * Portalled to <body> so no sheet, card or overflow rule can clip it, and
 * above the editor sheet's own stacking (50 + layer*2) so it stays on top.
 *
 * Minimising is remembered: someone who wants the space back should not have
 * to ask for it again on every slide and every visit.
 */
export function HeroPreviewDock({ slide, slideNumber }: Props) {
  const [minimized, setMinimized] = useState(readMinimized);
  /**
   * Animations play on demand rather than continuously. Replaying on every
   * keystroke would make the editor unusable, but never showing them at all
   * means the motion settings cannot be judged — so this is a button.
   */
  const [playToken, setPlayToken] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, minimized ? '1' : '0');
    } catch { /* private mode — the dock still works, it just forgets */ }
  }, [minimized]);

  if (!slide || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`hero-preview-dock${minimized ? ' hero-preview-dock--minimized' : ''}`}
      data-testid="hero-preview-dock"
      data-minimized={minimized ? 'yes' : 'no'}
    >
      <div className="hero-preview-dock__bar">
        <button
          type="button"
          className="hero-preview-dock__toggle"
          data-testid="hero-preview-dock-toggle"
          aria-expanded={!minimized}
          aria-label={minimized ? 'Show hero preview' : 'Hide hero preview'}
          onClick={() => setMinimized((v) => !v)}
        >
          <span className="hero-preview-dock__title">
            Preview
            {slideNumber ? <span className="hero-preview-dock__slide"> · Slide {slideNumber}</span> : null}
          </span>
          {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {minimized ? null : (
          <button
            type="button"
            className="hero-preview-dock__play"
            data-testid="hero-preview-dock-play"
            aria-label="Play the slide's animations"
            title="Play animations"
            onClick={() => setPlayToken((n) => n + 1)}
          >
            <Play size={13} />
            Play
          </button>
        )}
      </div>
      {minimized ? null : (
        <div className="hero-preview-dock__body" data-testid="hero-preview-dock-body">
          <VisualBlockPreview
            editor="hero"
            // Forced visible: a parked slide is exactly the one you want to
            // style before switching it on.
            value={JSON.stringify([{ ...slide, showing: true }])}
            appLabel="Website"
            playToken={playToken}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
