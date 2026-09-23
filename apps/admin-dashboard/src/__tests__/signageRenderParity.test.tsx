import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PARITY_AUTO_ITEMS,
  PARITY_AUTO_SLIDE,
  PARITY_CATEGORIES,
  PARITY_ITEMS,
  PARITY_MARKERS,
  PARITY_SLIDE,
  PARITY_THEME,
  PARITY_VARIABLES,
  SlideCanvas,
  expandAutoSlides,
  parityConfig,
} from '@shared/signage';
import '@shared/signage/signage.css';

describe('shared signage renderer parity (admin app)', () => {
  it('renders the same element-tree structure as /order/tv via @shared/signage', () => {
    const config = parityConfig('portrait');
    render(
      <SlideCanvas
        slide={PARITY_SLIDE}
        theme={PARITY_THEME}
        variables={PARITY_VARIABLES}
        items={PARITY_ITEMS}
        config={config}
        preview
      />,
    );

    for (const id of PARITY_MARKERS) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByText('Hello Bake & Grill')).toBeTruthy();
    expect(screen.getByText('Chicken Wrap')).toBeTruthy();
    expect(screen.getByText('45.00/-')).toBeTruthy();
    expect(document.querySelector('.signage-slide-canvas.is-preview')).toBeTruthy();
    expect(document.querySelector('.signage-enter-fade')).toBeTruthy();
    expect(document.querySelector('.signage-menu-list')).toBeTruthy();
  });

  it('encodes /menu on a QR element that has no binding at all', () => {
    // The writer-side defaults and the stored-JSON migration cannot reach a
    // QR that omitted binding.url. This is the renderer's last fallback.
    render(
      <SlideCanvas
        slide={{
          id: 'qr-unbound',
          name: 'QR',
          seconds: 8,
          weight: 1,
          transition: 'fade',
          background: { type: 'solid', value: '#1C1408' },
          elements: [{ id: 'qr1', type: 'qr', x: 30, y: 30, w: 40, h: 40, z: 1 }],
        }}
        theme={PARITY_THEME}
        variables={PARITY_VARIABLES}
        items={PARITY_ITEMS}
        config={parityConfig('portrait')}
        logoUrl="/logo.png"
        preview
      />,
    );

    // Drawn in-page with the brand mark, not fetched from a third party
    // (signage audit, 2026-09-23), so it works offline and carries the logo.
    const qr = screen.getByTestId('signage-qr');
    expect(qr.getAttribute('data-url')).toMatch(/\/menu$/);
    expect(qr.querySelector('svg')).toBeTruthy();
    expect(qr.querySelector('svg image')).toBeTruthy();
    expect(document.querySelector('img[src*="qrserver"]')).toBeNull();
  });
});

describe('auto menu expansion parity (admin app)', () => {
  it('expands one auto_menu entry into the same slides in both apps', () => {
    const expanded = expandAutoSlides(PARITY_AUTO_SLIDE, PARITY_AUTO_ITEMS, PARITY_CATEGORIES, 0);

    // Every item is listed under its category; the discounted and the
    // photographed one also earn showcase slides, spread through the lists.
    // The opted-out item appears nowhere.
    expect(expanded.map((s) => s.id)).toEqual([
      'auto-cat-1-0',
      'auto-sc-22',
      'auto-cat-2-0',
      'auto-sc-21',
    ]);

    const config = parityConfig('landscape');
    render(
      <SlideCanvas
        slide={expanded[1]}
        theme={PARITY_THEME}
        variables={PARITY_VARIABLES}
        items={PARITY_AUTO_ITEMS}
        config={config}
        preview
      />,
    );

    expect(screen.getByTestId('signage-el-item_card')).toBeTruthy();
    expect(screen.getByText('Chicken Wrap')).toBeTruthy();
    expect(screen.getByText('35.00/-')).toBeTruthy();
    expect(screen.getByTestId('signage-special-badge').textContent).toBe('22% OFF');
    expect(screen.queryByText('Hidden Item')).toBeNull();
  });
});
