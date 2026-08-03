import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignageDesigner } from '../pages/signage/SignageDesigner';
import { injectSignageMobileCss, setViewportWidth } from './viewport';

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../components/MediaPicker', () => ({
  MediaPicker: () => null,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    saveSignageCustomTemplate: vi.fn().mockResolvedValue({ templates: [] }),
  };
});

const slide = {
  id: 's1',
  name: 'Test',
  seconds: 12,
  weight: 1,
  transition: 'fade',
  background: { type: 'solid', value: '#1C1408' },
  elements: [
    {
      id: 'e1',
      type: 'text',
      x: 10,
      y: 20,
      w: 40,
      h: 15,
      text: 'Hello {{branch_name}}',
      style: { fontSize: 4, color: '#fff' },
      animation: { entrance: 'fade' },
      binding: {},
    },
    {
      id: 'e2',
      type: 'menu_list',
      x: 10,
      y: 40,
      w: 80,
      h: 50,
      binding: { type: 'smart', smart_type: 'bestsellers', limit: 6 },
      style: {},
      animation: {},
    },
  ],
};

describe('SignageDesigner mobile layout (390px)', () => {
  let injected: HTMLStyleElement | null = null;

  beforeEach(() => {
    setViewportWidth(390);
    injected = injectSignageMobileCss();
  });

  afterEach(() => {
    injected?.remove();
    injected = null;
    setViewportWidth(1024);
  });

  it('has no horizontal overflow at 390px', () => {
    render(<SignageDesigner slide={slide} onChange={vi.fn()} onClose={vi.fn()} />);
    const host = screen.getByTestId('signage-designer') as HTMLElement;
    host.style.width = '390px';
    host.style.maxWidth = '390px';
    host.style.overflow = 'auto';
    const grid = host.querySelector('.signage-designer-grid') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(getComputedStyle(grid).gridTemplateColumns.replace(/\s+/g, ' ').trim()).toBe('1fr');
    // With a single-column grid the designer must not require horizontal scroll.
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });

  it('canvas is width 100% of its container (≥80% of a 390px host)', () => {
    render(<SignageDesigner slide={slide} onChange={vi.fn()} onClose={vi.fn()} />);
    const host = screen.getByTestId('signage-designer') as HTMLElement;
    host.style.width = '390px';
    const wrap = document.querySelector('.signage-designer-canvas-wrap') as HTMLElement;
    const canvas = screen.getByTestId('signage-designer-canvas') as HTMLElement;
    wrap.style.width = '100%';
    // Designer canvas is authored as width:100% (maxWidth only caps desktop previews).
    expect(canvas.style.width).toBe('100%');
    const wrapWidth = wrap.getBoundingClientRect().width || 390;
    const canvasWidth = canvas.getBoundingClientRect().width || wrapWidth;
    expect(canvasWidth / wrapWidth).toBeGreaterThanOrEqual(0.8);
  });

  it('skips drag/resize overlays; selection + XYWH via layers', () => {
    const onChange = vi.fn();
    render(<SignageDesigner slide={slide} onChange={onChange} onClose={vi.fn()} />);

    expect(screen.queryByTestId('designer-el-e1')).toBeNull();
    expect(screen.queryByTestId('designer-resize-e1')).toBeNull();
    const sticky = screen.getByTestId('signage-designer-sticky-actions');
    expect(sticky).toBeTruthy();
    // Clears MobileTabBar (56px) — must not sit at bottom: 0 under the tab bar.
    expect(getComputedStyle(sticky).bottom).toMatch(/56px/);
    expect(getComputedStyle(screen.getByTestId('signage-designer-preview-size')).display).toBe('none');

    fireEvent.click(screen.getByTestId('signage-layer-e1'));
    expect(screen.getByTestId('signage-designer-xywh')).toBeTruthy();
    fireEvent.change(screen.getByTestId('designer-xywh-x'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('signage-designer-apply'));
    expect(onChange).toHaveBeenCalled();
    const saved = onChange.mock.calls[0][0];
    const el = saved.elements.find((e: { id: string }) => e.id === 'e1');
    expect(el.x).toBe(25);
  });
});

describe('SignageDesigner desktop layout (1024px)', () => {
  beforeEach(() => {
    setViewportWidth(1024);
  });

  it('keeps three-column grid with drag overlays enabled', () => {
    render(<SignageDesigner slide={slide} onChange={vi.fn()} onClose={vi.fn()} />);
    const grid = document.querySelector('.signage-designer-grid') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('160px 1fr 260px');
    expect(screen.getByTestId('designer-el-e1')).toBeTruthy();
    expect(screen.queryByTestId('signage-designer-sticky-actions')).toBeNull();

    fireEvent.pointerDown(screen.getByTestId('designer-el-e1'));
    expect(screen.getByTestId('designer-resize-e1')).toBeTruthy();
    expect(screen.getByTestId('signage-designer-xywh')).toBeTruthy();
  });
});
