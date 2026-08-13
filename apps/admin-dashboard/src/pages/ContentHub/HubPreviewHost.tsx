import type { ReactNode } from 'react';
import type { ContentApp } from '../../api/content';
import { PreviewPane } from './PreviewPane';

type Common = {
  lockedApp: ContentApp;
  websiteUrl: string | null;
  orderAppUrl: string | null;
  loading: boolean;
  draftStatus?: ReactNode;
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
  const { lockedApp, websiteUrl, orderAppUrl, loading } = props;

  if (props.mode === 'mobile-sheet') {
    return (
      <PreviewPane
        variant="sheet"
        lockedApp={lockedApp}
        websiteUrl={websiteUrl}
        orderAppUrl={orderAppUrl}
        loading={loading}
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
        lockedApp={lockedApp}
        websiteUrl={websiteUrl}
        orderAppUrl={orderAppUrl}
        loading={loading}
      />
    );
  }

  return (
    <PreviewPane
      variant="sheet"
      lockedApp={lockedApp}
      websiteUrl={websiteUrl}
      orderAppUrl={orderAppUrl}
      loading={loading}
      open={props.open}
      onClose={props.onClose}
      draftStatus={props.draftStatus}
      layer={3}
    />
  );
}
