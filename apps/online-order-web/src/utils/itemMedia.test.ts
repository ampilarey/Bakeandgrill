import { describe, it, expect } from 'vitest';
import {
  buildItemSlides,
  buildItemSlideUrls,
  buildJpegSrcSet,
  buildWebpSrcSet,
} from '../utils/itemMedia';

describe('srcset helpers', () => {
  it('buildJpegSrcSet includes thumb 400w and crop 1200w', () => {
    expect(buildJpegSrcSet({
      url: '/storage/menu/a.jpg',
      thumbUrl: '/storage/thumbs/a.jpg',
    })).toBe('/storage/thumbs/a.jpg 400w, /storage/menu/a.jpg 1200w');
  });

  it('buildJpegSrcSet omits duplicate when no distinct thumb', () => {
    expect(buildJpegSrcSet({ url: '/storage/menu/a.jpg' })).toBeUndefined();
  });

  it('buildWebpSrcSet omits missing candidates', () => {
    expect(buildWebpSrcSet({ webpUrl: '/a.webp' })).toBe('/a.webp 1200w');
    expect(buildWebpSrcSet({})).toBeUndefined();
  });
});

describe('buildItemSlides', () => {
  it('source:all keeps main image first then gallery (legacy)', () => {
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
    }, { source: 'all' });

    expect(slides[0].type).toBe('image');
    expect(slides[0].url).toContain('/menu/main.jpg');
    expect(slides[1].type).toBe('video');
    expect(slides[1].poster).toContain('/posters/a.jpg');
    expect(slides[1].alt).toBe('Sizzle clip');
    expect(slides[2].type).toBe('image');
  });

  it('source:gallery with photos excludes main image; order primary→sort_order', () => {
    const slides = buildItemSlides({
      name: 'Burger',
      image_url: '/storage/menu/main.jpg',
      thumb_url: '/storage/menu/main-thumb.jpg',
      photos: [
        {
          url: '/storage/item-photos/1/b.jpg',
          media_type: 'image',
          sort_order: 2,
          is_primary: false,
        },
        {
          url: '/storage/item-photos/1/a.jpg',
          media_type: 'image',
          sort_order: 1,
          is_primary: true,
        },
      ],
    }, { source: 'gallery' });

    expect(slides).toHaveLength(2);
    expect(slides[0].url).toContain('/item-photos/1/a.jpg');
    expect(slides[1].url).toContain('/item-photos/1/b.jpg');
    expect(slides.every((s) => !s.url.includes('/menu/main'))).toBe(true);
  });

  it('source:gallery with empty photos falls back to main image', () => {
    const slides = buildItemSlides({
      name: 'Soup',
      image_url: '/storage/menu/soup.jpg',
      photos: [],
    }, { source: 'gallery' });

    expect(slides).toHaveLength(1);
    expect(slides[0].url).toContain('/menu/soup.jpg');
  });

  it('source:gallery strict with empty photos returns []', () => {
    const slides = buildItemSlides({
      name: 'Soup',
      image_url: '/storage/menu/soup.jpg',
      photos: [],
    }, { source: 'gallery', strict: true });

    expect(slides).toEqual([]);
  });

  it('preferThumb card mode uses first gallery photo thumb; video uses poster', () => {
    const slides = buildItemSlides({
      name: 'Burger',
      image_url: '/storage/menu/main.jpg',
      photos: [
        {
          url: '/storage/item-photos/1/full.jpg',
          thumb_url: '/storage/item-photos/1/thumbs/full.jpg',
          image_webp_url: '/storage/item-photos/1/full.webp',
          thumb_webp_url: '/storage/item-photos/1/thumbs/full.webp',
          media_type: 'image',
          sort_order: 1,
          is_primary: true,
        },
      ],
    }, { preferThumb: true, source: 'gallery' });

    expect(slides).toHaveLength(1);
    expect(slides[0].url).toContain('/thumbs/full.jpg');
    expect(slides[0].webpUrl).toContain('/thumbs/full.webp');
    expect(slides[0].thumbWebpUrl).toContain('/thumbs/full.webp');

    const videoUrls = buildItemSlideUrls({
      photos: [{
        url: '/storage/v.mp4',
        media_type: 'video',
        poster_url: '/storage/p.jpg',
        sort_order: 1,
        is_primary: true,
      }],
    }, { preferThumb: true, source: 'gallery' });
    expect(videoUrls[0]).toContain('/p.jpg');
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
    }, { preferThumb: true, source: 'gallery' });
    expect(urls[0]).toContain('/p.jpg');
  });

  it('uses defaultImageUrl when item has no gallery or main image', () => {
    const slides = buildItemSlides({
      name: 'Plain Bun',
      image_url: null,
      photos: [],
    }, { source: 'gallery', defaultImageUrl: '/storage/site/default_item.jpg' });

    expect(slides).toHaveLength(1);
    expect(slides[0].url).toContain('/storage/site/default_item.jpg');
    expect(slides[0].type).toBe('image');
  });

  it('prefers item image over defaultImageUrl', () => {
    const slides = buildItemSlides({
      name: 'Photo Burger',
      image_url: '/storage/menu/burger.jpg',
      photos: [],
    }, { source: 'gallery', defaultImageUrl: '/storage/site/default_item.jpg' });

    expect(slides).toHaveLength(1);
    expect(slides[0].url).toContain('/menu/burger.jpg');
  });

  it('returns empty slides when no item image and no defaultImageUrl', () => {
    const slides = buildItemSlides({
      name: 'Plain Bun',
      image_url: null,
      photos: [],
    }, { source: 'gallery' });

    expect(slides).toEqual([]);
  });
});
