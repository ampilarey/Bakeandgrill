import type { ReactNode } from 'react';
import { ContentItemEditor } from './ContentItemEditor';

export type ContentEditorSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional status / “not live yet” banner under the title. */
  status?: ReactNode;
  /** Sticky bottom action bar (Publish, Done, etc.). */
  footer?: ReactNode;
  /** Nesting depth for stacking above parent sheets (0 = base). */
  layer?: number;
  /** Accessible name override. */
  ariaLabel?: string;
  testId?: string;
  /** Element to restore focus to on close. */
  returnFocusTo?: HTMLElement | null;
};

/**
 * Focused Content Hub editor — full-screen on mobile, large right drawer on desktop.
 * Portals to document.body so overview cards cannot clip it.
 */
export function ContentEditorSheet({
  open,
  title,
  onClose,
  children,
  status,
  footer,
  layer = 0,
  ariaLabel,
  testId = 'content-editor-sheet',
  returnFocusTo,
}: ContentEditorSheetProps) {
  return (
    <ContentItemEditor
      open={open}
      title={title}
      onClose={onClose}
      status={status}
      footer={footer}
      layer={layer}
      ariaLabel={ariaLabel}
      testId={testId}
      returnFocusTo={returnFocusTo}
      presentation="auto"
    >
      {children}
    </ContentItemEditor>
  );
}
