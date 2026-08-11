import type { ReactNode } from 'react';
import { ButtonBandBlock } from './ButtonBandBlock';
import { DividerBlock } from './DividerBlock';
import { ImageBlock } from './ImageBlock';
import { ImageTextBlock } from './ImageTextBlock';
import { RichTextBlock } from './RichTextBlock';
import { VideoBlock } from './VideoBlock';
import {
  isGenericBlockEmpty,
  isGenericBlockType,
  type BlockMedia,
  type GenericBlockSettings,
} from './blockTypes';

export * from './blockTypes';
export { ButtonBandBlock, DividerBlock, ImageBlock, ImageTextBlock, RichTextBlock, VideoBlock };

/**
 * Renders one generic content block, or null when the type does not belong on
 * the order app (`faq_list` is website-only) or has nothing to show.
 */
export function renderGenericBlock(
  type: string,
  key: string,
  settings: GenericBlockSettings,
  media: BlockMedia,
  apiOrigin: string,
): ReactNode {
  if (!isGenericBlockType(type)) return null;
  if (isGenericBlockEmpty(type, settings, media)) return null;

  switch (type) {
    case 'rich_text':
      return <RichTextBlock key={key} settings={settings} />;
    case 'image':
      return <ImageBlock key={key} settings={settings} media={media} apiOrigin={apiOrigin} />;
    case 'image_text':
      return <ImageTextBlock key={key} settings={settings} media={media} apiOrigin={apiOrigin} />;
    case 'button_band':
      return <ButtonBandBlock key={key} settings={settings} />;
    case 'divider':
      return <DividerBlock key={key} settings={settings} />;
    case 'video':
      return <VideoBlock key={key} settings={settings} media={media} apiOrigin={apiOrigin} />;
    default:
      return null;
  }
}
