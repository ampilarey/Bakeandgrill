import type { ReactNode } from 'react';
import { ButtonBandBlock } from './ButtonBandBlock';
import { DividerBlock } from './DividerBlock';
import { ImageBlock } from './ImageBlock';
import { ImageTextBlock } from './ImageTextBlock';
import { RichTextBlock } from './RichTextBlock';
import { VideoBlock } from './VideoBlock';
import { FaqListBlock } from './FaqListBlock';
import {
  isGenericBlockEmpty,
  isGenericBlockType,
  type BlockMedia,
  type GenericBlockSettings,
} from './blockTypes';

export * from './blockTypes';
export { ButtonBandBlock, DividerBlock, ImageBlock, ImageTextBlock, RichTextBlock, VideoBlock, FaqListBlock };

/**
 * Renders one generic content block, or null when the type is unknown / empty.
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
    case 'faq_list':
      return <FaqListBlock key={key} settings={settings} />;
    default:
      return null;
  }
}
