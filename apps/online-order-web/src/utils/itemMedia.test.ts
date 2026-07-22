import { describe, it, expect } from 'vitest';
import { buildItemSlides, buildItemSlideUrls } from '../utils/itemMedia';

describe('buildItemSlides', () => {
  it('maps video photos with poster and keeps main image first', () => {
    const slides = buildItemSlides({
      name: 'Burger',
      image_url: '/storage/menu/main.jpg',
      photos: [
        {
          url: '/storage/item-photos/1/video/a.mp4',
          media_type: 'video',
          poster_url: '/storage/item-photos/1/posters/a.jpg',
          sort_order: 1,
          is_primary: true,
          alt_text: 'Sizzle clip',
        },
        {
          url: '/storage/item-photos/1/b.jpg',
          media_type: 'image',
          sort_order: 2,
          is_primary: false,
        },
      ],
    });

    expect(slides[0].type).toBe('image');
    expect(slides[0].url).toContain('/menu/main.jpg');
    expect(slides[1].type).toBe('video');
    expect(slides[1].poster).toContain('/posters/a.jpg');
    expect(slides[1].alt).toBe('Sizzle clip');
    expect(slides[2].type).toBe('image');
  });

  it('preferThumb uses poster for video in URL shim', () => {
    const urls = buildItemSlideUrls({
      photos: [{
        url: '/storage/v.mp4',
        media_type: 'video',
        poster_url: '/storage/p.jpg',
        sort_order: 1,
        is_primary: true,
      }],
    }, { preferThumb: true });
    expect(urls[0]).toContain('/p.jpg');
  });
});
