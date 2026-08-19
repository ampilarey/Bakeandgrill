/**
 * The hero preview has to answer "what will this look like" for settings the
 * old preview ignored entirely.
 *
 * It honoured three things — text position, photo opacity, scrim — while the
 * editor grew roughly thirty controls for per-line backgrounds, outlines,
 * borders, gradients, geometry, type and per-part alignment. Every one of
 * those meant saving and reloading the public site to see what it did.
 *
 * These assert the markup contract the preview shares with
 * partials/home/hero.blade.php: the same class names, data attributes and
 * --hero-el-* custom properties. The ported CSS in index.css keys off exactly
 * these, so if the contract holds the picture holds.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualBlockPreview } from './VisualBlockPreview';

function drawHero(slide: Record<string, unknown>) {
  render(
    <VisualBlockPreview
      editor="hero"
      value={JSON.stringify([{ showing: true, title: 'Hero title', ...slide }])}
      appLabel="Website"
    />,
  );
  return screen.getByTestId('hero-visual-preview');
}

const title = () => document.querySelector('.banner-title') as HTMLElement;
const sub = () => document.querySelector('.banner-sub') as HTMLElement;

describe('hero preview — background shapes', () => {
  it('draws one box per line for the line shape, on the inline spans', () => {
    // The owner's complaint that started this: "If there are 2 lines
    // background is like a box. I need separate small background for each
    // line." Only an inline span can clone the box per line.
    drawHero({ title: 'First line<br>Second line', title_bg: 'dark', title_bg_shape: 'line' });

    expect(title().getAttribute('data-bg-shape')).toBe('line');
    const lines = document.querySelectorAll('.banner-title .hero-title-line');
    expect(lines).toHaveLength(2);
    // Each line carries its index, which is what staggered motion keys off.
    expect((lines[0] as HTMLElement).style.getPropertyValue('--hero-line-i')).toBe('0');
    expect((lines[1] as HTMLElement).style.getPropertyValue('--hero-line-i')).toBe('1');
  });

  it('draws a single hugging box for the hug shape', () => {
    drawHero({ title: 'One<br>Two', title_bg: 'dark', title_bg_shape: 'hug' });
    expect(title().getAttribute('data-bg-shape')).toBe('hug');
  });

  it('marks glass as a material rather than replacing the shape', () => {
    drawHero({ title_bg: 'glass', title_bg_shape: 'hug' });
    expect(title().getAttribute('data-bg-glass')).toBe('1');
    expect(title().getAttribute('data-bg-shape')).toBe('hug');
  });

  it('sets no background attributes at all when none is chosen', () => {
    drawHero({});
    expect(title().getAttribute('data-has-bg')).toBeNull();
    expect(title().getAttribute('data-bg-glass')).toBeNull();
  });
});

describe('hero preview — colours, outline and border', () => {
  it('emits the owner colours as the same custom properties the site reads', () => {
    drawHero({ title_text_color: '#ff0000', title_em_color: '#00ff00' });
    expect(title().style.getPropertyValue('--hero-el-text')).toBe('#ff0000');
    expect(title().style.getPropertyValue('--hero-el-em')).toBe('#00ff00');
  });

  it('carries an outline independently of the shape, so a box can have one', () => {
    // Outline used to BE a shape, which meant picking a box removed it.
    drawHero({ title_bg: 'dark', title_bg_shape: 'hug', title_outline: true, title_outline_color: '#123456' });
    expect(title().getAttribute('data-outline')).toBe('1');
    expect(title().getAttribute('data-bg-shape')).toBe('hug');
    expect(title().style.getPropertyValue('--hero-el-outline')).toBe('#123456');
  });

  it('keeps the box border separate from the letter outline', () => {
    // A box shape with a border and no outline: the two are independent
    // switches with their own colours, which they were not before.
    drawHero({
      title_bg: 'dark',
      title_bg_shape: 'hug',
      title_border: true,
      title_border_color: '#abcdef',
    });
    expect(title().getAttribute('data-border')).toBe('1');
    expect(title().style.getPropertyValue('--hero-el-border')).toBe('#abcdef');
    expect(title().getAttribute('data-outline')).toBeNull();
  });

  it('implies a letter outline when the background is left on the outline shape', () => {
    // The default shape for a background is `outline`, so the outline comes
    // on with it unless the owner says otherwise. Pinned because the
    // preceding test would otherwise look like it contradicts this.
    drawHero({ title_bg: 'dark' });
    expect(title().getAttribute('data-outline')).toBe('1');
  });

  it('builds a gradient when a second background colour is set', () => {
    drawHero({ title_bg: '#111111', title_bg_color2: '#222222', title_bg_angle: 90 });
    expect(title().style.getPropertyValue('--hero-el-bg')).toContain('linear-gradient(90deg');
  });

  it('omits a property the owner never set, so the stylesheet default wins', () => {
    // The whole reason unset values are omitted rather than defaulted.
    drawHero({ title_bg: 'dark' });
    expect(title().style.getPropertyValue('--hero-el-text')).toBe('');
    expect(title().style.getPropertyValue('--hero-el-weight')).toBe('');
  });
});

describe('hero preview — geometry and type', () => {
  it('passes radius, padding, scale and weight through', () => {
    // Geometry fields are slider positions (0-100) mapped onto their range,
    // not raw lengths: radius spans 0-40px, pad-x 0-2em, pad-y 0-1.5em.
    drawHero({
      title_bg: 'dark',
      title_bg_radius: 50,
      title_bg_pad_x: 50,
      title_bg_pad_y: 50,
      title_font_scale: 150,
      title_font_weight: 600,
    });
    const t = title();
    expect(t.style.getPropertyValue('--hero-el-radius')).toBe('20px');
    expect(t.style.getPropertyValue('--hero-el-pad-x')).toBe('1em');
    expect(t.style.getPropertyValue('--hero-el-pad-y')).toBe('0.75em');
    // Scale multiplies --hero-title-base, exactly as it does on the site.
    expect(t.style.getPropertyValue('--hero-el-scale')).toBe('1.5');
    expect(t.style.getPropertyValue('--hero-el-weight')).toBe('600');
  });
});

describe('hero preview — alignment and motion', () => {
  it('aligns each part on its own', () => {
    // Owner, 2026-08-17: "I think alignment also be separated. Why not?"
    drawHero({ subtitle: 'Sub', title_align: 'left', subtitle_align: 'right' });
    expect(title().getAttribute('data-align')).toBe('left');
    expect(sub().getAttribute('data-align')).toBe('right');
  });

  it('falls back to the slide-wide alignment for a part that has none', () => {
    drawHero({ subtitle: 'Sub', text_align: 'right' });
    expect(title().getAttribute('data-align')).toBe('right');
    expect(sub().getAttribute('data-align')).toBe('right');
  });

  it('splits the heading into word spans for the word animation', () => {
    drawHero({ title: 'Three word heading', title_anim: 'word' });
    expect(title().getAttribute('data-anim')).toBe('word');
    expect(document.querySelectorAll('.banner-title .hero-word')).toHaveLength(3);
  });

  it('marks a box animation only when one is chosen', () => {
    drawHero({ title_bg: 'dark', title_box_anim: 'glow' });
    expect(title().getAttribute('data-box-anim')).toBe('glow');
  });

  it('leaves data-box-anim off when the part has none', () => {
    drawHero({ title_bg: 'dark' });
    expect(title().getAttribute('data-box-anim')).toBeNull();
  });
});

describe('hero preview — the shade behind the copy', () => {
  it('turns the shade off when the owner turns it off', () => {
    drawHero({ copy_scrim_mode: 'off' });
    expect(document.querySelector('.banner-copy')?.getAttribute('data-copy-scrim')).toBe('off');
  });

  it('steps the shade back automatically when a part has its own panel', () => {
    // Auto exists to stop a second box being drawn around the first — the
    // "too large" look the owner reported.
    drawHero({ title_bg: 'dark', title_bg_shape: 'hug' });
    expect(document.querySelector('.banner-copy')?.getAttribute('data-copy-scrim')).toBe('off');
  });

  it('keeps the shade when nothing carries its own panel', () => {
    drawHero({ subtitle: 'Plain copy' });
    expect(document.querySelector('.banner-copy')?.getAttribute('data-copy-scrim')).toBeNull();
  });
});

/**
 * Fidelity gaps found by comparing the dock against the live site, 2026-08-19.
 *
 * The ported CSS was correct — verified in a browser, per-line boxes and all.
 * What was wrong was what the preview fed it, and what it invented.
 */
describe('hero preview — fidelity with the live banner', () => {
  it('never invents a heading the site would not draw', () => {
    // It used to fall back to "Hero title", so a slide with only buttons
    // previewed a heading that never appears.
    drawHero({ title: '', cta_text: 'Order' });
    expect(document.querySelector('.banner-title')).toBeNull();
  });

  it('keeps the dark banner base so a photoless slide is not a white card', () => {
    const hero = drawHero({ title: 'No photo' });
    expect(hero.style.background).toContain('rgb(28, 20, 8)');
  });

  it('feeds the copy-shade strength through, so the slider does something', () => {
    const hero = drawHero({ title: 'Shaded', text_background: 80 });
    const scrim = hero.style.getPropertyValue('--hero-scrim');
    expect(scrim).not.toBe('');
    expect(Number(scrim)).toBeGreaterThan(0);
  });

  it('steps a long heading down the way the site does', () => {
    drawHero({ title: 'A very long heading that will certainly wrap across several lines on a phone' });
    expect(title().getAttribute('data-len')).toBeTruthy();
  });

  it('leaves data-len off a short heading', () => {
    drawHero({ title: 'Short' });
    expect(title().getAttribute('data-len')).toBeNull();
  });

  it('draws the buttons with the site classes, so their colours apply', () => {
    // The old generic chip classes ignored cta background settings entirely,
    // which made an amber primary and a glass secondary look swapped.
    drawHero({ cta_text: 'Order now', cta2_text: 'View menu', cta1_bg: 'glass' });

    const primary = document.querySelector('.banner-cta-primary') as HTMLElement;
    const secondary = document.querySelector('.banner-cta-secondary') as HTMLElement;

    expect(primary?.textContent).toBe('Order now');
    expect(secondary?.textContent).toBe('View menu');
    expect(primary.getAttribute('data-bg-glass')).toBe('1');
    expect(primary.style.getPropertyValue('--hero-el-bg')).not.toBe('');
  });
});

describe('hero preview — the photo', () => {
  const media = () => document.querySelector('.visual-block-preview__hero-media') as HTMLImageElement;

  it('shows the photo instead of blowing it out to white', () => {
    // The regression the owner hit twice: photo_brightness is 0-100, and it
    // was being passed into a CSS brightness() filter. A normal slide became
    // brightness(100) — the image loaded and rendered as solid white, which
    // read as "the photo is not showing".
    drawHero({ image: '/storage/media/hero.jpg', photo_brightness: 100 });

    expect(media().style.filter).toBe('');
  });

  it('uses the site formula for photo opacity, not its own', () => {
    // Site: .banner-slide img { opacity: calc(0.45 + 0.55 * var(--hero-photo)) }
    drawHero({ image: '/storage/media/hero.jpg', photo_brightness: 100 });
    expect(Number(media().style.opacity)).toBeCloseTo(1, 2);

    document.body.innerHTML = '';
    drawHero({ image: '/storage/media/hero.jpg', photo_brightness: 0 });
    // Never fully transparent — the site floors it at 0.45.
    expect(Number(media().style.opacity)).toBeCloseTo(0.45, 2);
  });

  it('honours the focal point the owner picked', () => {
    drawHero({ image: '/storage/media/hero.jpg', image_focal_x: 30, image_focal_y: 70 });
    expect(media().style.objectPosition).toBe('30% 70%');
  });
});
