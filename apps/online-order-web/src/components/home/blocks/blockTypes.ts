import DOMPurify from 'dompurify';
import { safePublicUrl } from '../../../utils/safePublicUrl';

/** Types the layout builder calls "generic" — free-form content blocks. */
export const GENERIC_BLOCK_TYPES = [
  'rich_text',
  'image',
  'image_text',
  'button_band',
  'divider',
  'video',
] as const;

export type GenericBlockType = (typeof GENERIC_BLOCK_TYPES)[number];

export type BlockImage = {
  url: string;
  webp?: string | null;
  thumb?: string | null;
  thumb_webp?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
};

export type BlockVideo = {
  url: string;
  poster_url?: string | null;
  alt?: string | null;
};

/** Media resolved server-side — the app never sees raw media ids. */
export type BlockMedia = {
  image?: BlockImage | null;
  video?: BlockVideo | null;
} | null;

export type GenericBlockSettings = Record<string, unknown>;

export function isGenericBlockType(type: string): type is GenericBlockType {
  return (GENERIC_BLOCK_TYPES as readonly string[]).includes(type);
}

export function str(settings: GenericBlockSettings, key: string): string {
  const value = settings[key];
  return typeof value === 'string' ? value : '';
}

export function plain(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

/** Same allow-list the server sanitiser uses, applied again before printing. */
export function safeHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ['br', 'em', 'strong', 'b', 'i', 'a', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href'],
  });
}

export function absoluteUrl(src: string | null | undefined, apiOrigin: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return `${apiOrigin}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** Only safe public URLs survive. */
export function safeUrl(url: string): string {
  return safePublicUrl(url) ?? '';
}

/** True when a block would render an empty shell, so callers can skip it. */
export function isGenericBlockEmpty(
  type: string,
  settings: GenericBlockSettings,
  media: BlockMedia,
): boolean {
  const text = (key: string) => plain(str(settings, key));

  switch (type) {
    case 'rich_text':
      return text('heading') === '' && text('body') === '';
    case 'image':
      return !media?.image?.url;
    case 'video':
      return !media?.video?.url;
    case 'image_text':
      return !media?.image?.url && text('heading') === '' && text('body') === '';
    case 'button_band':
      return text('text') === '' && text('button1_label') === '' && text('button2_label') === '';
    case 'divider':
      return false;
    default:
      return true;
  }
}
