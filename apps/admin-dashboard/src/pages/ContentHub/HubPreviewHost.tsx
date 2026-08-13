import type { ReactNode } from 'react';
import type { ContentApp } from '../../api/content';
import { PreviewPane } from './PreviewPane';
import type { PreviewDevice } from './LivePreviewFrame';

type Common = {
  lockedApp: ContentApp;
  websiteUrl: string | null;
  orderAppUrl: string | null;
  loading: boolean;
  draftStatus?: ReactNode;
  /** Matrix row 13 — device from the editor's selected surface. */
  editorDevice?: PreviewDevice | null;
  editorSurfaceId?: string | null;
};

export type HubPreviewHostProps =
  | (Common & {
      mode: 'mobile-sheet';
      open: boolean;
      onClose: () => void;
    })
  | (Common & {
      mode: 'desktop-column';
    })
  | (Common & {
      mode: 'compact-sheet';
      open: boolean;
      onClose: () => void;
    });

/**
 * PreviewPane / LivePreviewFrame wiring for Content Hub.
 * Call once per host site so layout placement stays identical
 * (mobile sheet inside mobile shell, column inside desktop shell, compact sheet as sibling).
 */
export function HubPreviewHost(props: HubPreviewHostProps) {
  const {
    lockedApp,
    websiteUrl,
    orderAppUrl,
    loading,
    editorDevice = null,
    editorSurfaceId = null,
  } = props;

  const shared = {
    lockedApp,
    websiteUrl,
    orderAppUrl,
    loading,
    editorDevice,
    editorSurfaceId,
  };

  if (props.mode === 'mobile-sheet') {
    return (
      <PreviewPane
        variant="sheet"
        {...shared}
        open={props.open}
        onClose={props.onClose}
        draftStatus={props.draftStatus}
        layer={3}
      />
    );
  }

  if (props.mode === 'desktop-column') {
    return (
      <PreviewPane
        variant="column"
        {...shared}
      />
    );
  }

  return (
    <PreviewPane
      variant="sheet"
      {...shared}
      open={props.open}
      onClose={props.onClose}
      draftStatus={props.draftStatus}
      layer={3}
    />
  );
}
