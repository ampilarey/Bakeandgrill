import { useEffect, useState, type ReactNode } from 'react';
import { Monitor, Smartphone, X } from 'lucide-react';
import { LivePreviewFrame } from './LivePreviewFrame';

export type PreviewApp = 'website' | 'order_app';

type Props = {
  websiteUrl: string | null;
  orderAppUrl: string | null;
  loading?: boolean;
  /** Sticky column on desktop; full-screen sheet on mobile. */
  variant: 'column' | 'sheet';
  open?: boolean;
  onClose?: () => void;
  /** Publish-state banner — must stay truthful inside the preview sheet. */
  draftStatus?: ReactNode;
};

/**
 * Wraps LivePreviewFrame with Website / Order app toggle.
 * Device toggle lives inside LivePreviewFrame (Desktop / Mobile).
 */
export function PreviewPane({
  websiteUrl,
  orderAppUrl,
  loading,
  variant,
  open = true,
  onClose,
  draftStatus,
}: Props) {
  const [app, setApp] = useState<PreviewApp>('website');

  useEffect(() => {
    if (variant === 'sheet' && !open) return;
  }, [variant, open]);

  const url = app === 'order_app' ? orderAppUrl : websiteUrl;

  const body = (
    <div data-testid="preview-pane" className={`hub-preview-pane hub-preview-pane--${variant}`}>
      <div className="hub-preview-pane-toolbar">
        <div className="hub-preview-app-toggle" role="group" aria-label="Preview app">
          {([
            ['website', 'Website'],
            ['order_app', 'Order app'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`preview-app-${id}`}
              aria-pressed={app === id}
              onClick={() => setApp(id)}
              className={`hub-preview-seg${app === id ? ' hub-preview-seg--active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        {variant === 'sheet' && onClose ? (
          <button
            type="button"
            data-testid="preview-sheet-close"
            className="hub-preview-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>
      {draftStatus ? (
        <div className="hub-preview-draft-status" data-testid="preview-draft-status">
          {draftStatus}
        </div>
      ) : null}
      <div className="hub-preview-pane-frame">
        <LivePreviewFrame
          url={url}
          loading={loading}
          defaultDevice={variant === 'sheet' ? 'mobile' : 'desktop'}
        />
      </div>
      {variant === 'column' ? (
        <div className="hub-preview-hint">
          <Monitor size={12} /> / <Smartphone size={12} /> use the device toggle on the preview
        </div>
      ) : null}
    </div>
  );

  if (variant === 'sheet') {
    if (!open) return null;
    return (
      <div data-testid="preview-sheet" className="hub-preview-sheet" role="dialog" aria-modal="true" aria-label="Live preview">
        <div className="hub-preview-sheet-backdrop" onClick={onClose} />
        <div className="hub-preview-sheet-panel">{body}</div>
      </div>
    );
  }

  return body;
}
