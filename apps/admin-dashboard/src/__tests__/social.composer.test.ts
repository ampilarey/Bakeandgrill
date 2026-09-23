import { describe, it, expect } from 'vitest';
import {
  captionLength, fromLocalDateTimeInput, platformsNeedingImage, suggestCaption,
  tightestCaptionLimit, toLocalDateTimeInput,
} from '../pages/social/composer';
import type { SocialPlatformCaps } from '../api';

const caps: Record<string, SocialPlatformCaps> = {
  facebook: { text: true, photo: true, requires_photo: false, caption_max: 63206, caption_max_photo: 63206, credentials: [] },
  instagram: { text: false, photo: true, requires_photo: true, caption_max: 2200, caption_max_photo: 2200, credentials: [] },
  telegram: { text: true, photo: true, requires_photo: false, caption_max: 4096, caption_max_photo: 1024, credentials: [] },
  viber: { text: true, photo: true, requires_photo: false, caption_max: 7000, caption_max_photo: 7000, credentials: [] },
};

describe('composer helpers', () => {
  it('finds the tightest caption limit, which depends on whether a photo is attached', () => {
    expect(tightestCaptionLimit(['facebook', 'telegram'], caps, false)).toEqual({ limit: 4096, platform: 'telegram' });
    expect(tightestCaptionLimit(['facebook', 'telegram'], caps, true)).toEqual({ limit: 1024, platform: 'telegram' });
    expect(tightestCaptionLimit(['facebook', 'instagram', 'viber'], caps, true)).toEqual({ limit: 2200, platform: 'instagram' });
    expect(tightestCaptionLimit([], caps, true)).toBeNull();
    expect(tightestCaptionLimit(['unknown'], caps, true)).toBeNull();
  });

  it('knows which selected platforms cannot post without a photo', () => {
    expect(platformsNeedingImage(['facebook', 'instagram'], caps)).toEqual(['instagram']);
    expect(platformsNeedingImage(['telegram'], caps)).toEqual([]);
  });

  it('counts Dhivehi letters as one each, like the platforms do', () => {
    expect(captionLength('މަސްރޮށި')).toBe(8);
    expect(captionLength('abc')).toBe(3);
    expect(captionLength('')).toBe(0);
  });

  it('round-trips a datetime-local value through an ISO instant in this zone', () => {
    const local = '2026-10-01T10:30';
    const iso = fromLocalDateTimeInput(local);
    expect(iso).toBe(new Date(local).toISOString());
    expect(toLocalDateTimeInput(iso)).toBe(local);
    expect(fromLocalDateTimeInput('')).toBeNull();
    expect(fromLocalDateTimeInput('not a date')).toBeNull();
    expect(toLocalDateTimeInput(null)).toBe('');
  });

  it('suggests a caption with the name, Dhivehi name, price and link', () => {
    const caption = suggestCaption({
      id: 7, name: 'Masroshi', name_dv: 'މަސްރޮށި', category: 'Hedhikaa', price: 45, base_price: 45,
      image_url: null, link_url: 'https://bakeandgrill.mv/menu/7', is_sellable: true,
    });
    expect(caption).toBe('Masroshi · މަސްރޮށި — MVR 45.00\nOrder now: https://bakeandgrill.mv/menu/7');
    expect(suggestCaption({
      id: 8, name: 'Tea', name_dv: null, category: null, price: 5, base_price: 5,
      image_url: null, link_url: 'https://bakeandgrill.mv/menu/8', is_sellable: true,
    })).toBe('Tea — MVR 5.00\nOrder now: https://bakeandgrill.mv/menu/8');
  });
});
