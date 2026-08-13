import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, Smartphone, X } from 'lucide-react';
import { LivePreviewFrame, type PreviewDevice } from './LivePreviewFrame';

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
  /**
   * Nesting depth when variant=sheet (portaled). Default 3 stacks above
   * section (0) and block (1) editor sheets.
   */
  layer?: number;
  /**
   * When set, preview is locked to this Content Hub destination.
   * Cross-app toggle is hidden so Website and Order App never mix.
   */
  lockedApp?: PreviewApp;
  /**
   * Matrix row 13: Desktop/Mobile from the editor's selected surface
   * (canonical selector). When set, LivePreviewFrame locks to this device.
   */
  editorDevice?: PreviewDevice | null;
  /** Optional surface id for test assertions (`website.desktop.home`). */
  editorSurfaceId?: string | null;
};

/**
 * Live preview for the current Content Hub app.
 * When `lockedApp` is set (always in Content Hub), only that app is shown.
 */
export function PreviewPane({
  websiteUrl,
  orderAppUrl,
  loading,
  variant,
  open = true,
  onClose,
  draftStatus,
  layer = 3,
  lockedApp,
  editorDevice = null,
  editorSurfaceId = null,
}: Props) {
  const [app, setApp] = useState<PreviewApp>(lockedApp ?? 'website');

  useEffect(() => {
    if (lockedApp) setApp(lockedApp);
  }, [lockedApp]);

  useEffect(() => {
    if (variant === 'sheet' && !open) return;
  }, [variant, open]);

  const url = app === 'order_app' ? orderAppUrl : websiteUrl;
  const appLabel = app === 'order_app' ? 'Order App' : 'Website';

  const body = (
    <div
      data-testid="preview-pane"
      className={`hub-preview-pane hub-preview-pane--${variant}`}
      data-editor-app={lockedApp ?? app}
      data-editor-device={editorDevice ?? undefined}
      data-editor-surface={editorSurfaceId ?? undefined}
    >
      <div className="hub-preview-pane-toolbar">
        {lockedApp ? (
          <div
            className="hub-preview-app-locked"
            data-testid={`preview-app-locked-${lockedApp}`}
            aria-label={`Previewing ${appLabel}`}
          >
            Previewing {appLabel}
          </div>
        ) : (
          <div className="hub-preview-app-toggle" role="group" aria-label="Preview app">
            {([
              ['website', 'Website'],
              ['order_app', 'Order App'],
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
        )}
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
          editorDevice={editorDevice}
        />
      </div>
      {variant === 'column' ? (
        <div className="hub-preview-hint" data-testid="preview-follows-editor-hint">
          {editorDevice ? (
            <>
              <Monitor size={12} /> / <Smartphone size={12} />
              {' '}follows the selected {editorDevice} surface
              {editorSurfaceId ? ` (${editorSurfaceId})` : ''}
            </>
          ) : (
            <>
              <Monitor size={12} /> / <Smartphone size={12} /> use the device toggle on the preview
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  if (variant === 'sheet') {
    if (!open || typeof document === 'undefined') return null;
    return createPortal(
      <div
        data-testid="preview-sheet"
        className="hub-preview-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${appLabel} live preview`}
        style={{ zIndex: 50 + layer * 2 }}
      >
        <div className="hub-preview-sheet-backdrop" onClick={onClose} />
        <div className="hub-preview-sheet-panel">{body}</div>
      </div>,
      document.body,
    );
  }

  return body;
}
