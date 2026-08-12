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

  it('canvas is authored at width 100% on mobile', () => {
    render(<SignageDesigner slide={slide} onChange={vi.fn()} onClose={vi.fn()} />);
    const canvas = screen.getByTestId('signage-designer-canvas') as HTMLElement;
    // Authored inline style — not a jsdom layout measurement.
    expect(canvas.style.width).toBe('100%');
  });

  it('skips drag/resize overlays; selection + XYWH via layers', () => {
    const onChange = vi.fn();
    render(<SignageDesigner slide={slide} onChange={onChange} onClose={vi.fn()} />);

    expect(screen.queryByTestId('designer-el-e1')).toBeNull();
    expect(screen.queryByTestId('designer-resize-e1')).toBeNull();
    expect(screen.getByTestId('signage-designer-sticky-actions')).toBeTruthy();

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
