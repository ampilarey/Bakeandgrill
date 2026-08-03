import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignageDesigner } from '../pages/signage/SignageDesigner';
import { setViewportWidth } from './viewport';

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

beforeEach(() => {
  setViewportWidth(1024);
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

describe('SignageDesigner', () => {
  it('edits text elements and persists on apply', () => {
    const onChange = vi.fn();
    render(
      <SignageDesigner
        slide={slide}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('signage-designer')).toBeTruthy();
    expect(screen.getByTestId('signage-designer-canvas')).toBeTruthy();
    expect(screen.getByTestId('signage-safe-zone')).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId('designer-el-e1'));
    const text = screen.getByTestId('designer-text') as HTMLTextAreaElement;
    fireEvent.change(text, { target: { value: 'Edited {{branch_name}}' } });

    fireEvent.click(screen.getByTestId('signage-designer-apply'));
    expect(onChange).toHaveBeenCalled();
    const saved = onChange.mock.calls[0][0];
    const el = saved.elements.find((e: { id: string }) => e.id === 'e1');
    expect(el.text).toBe('Edited {{branch_name}}');
  });

  it('adds a data-bound menu_list element and renders via shared SlideCanvas', () => {
    render(
      <SignageDesigner slide={{ ...slide, elements: [] }} onChange={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'menu_list' }));
    expect(screen.getAllByText('menu_list').length).toBeGreaterThan(0);
    const overlays = screen.getAllByTestId(/^designer-el-/);
    expect(overlays.length).toBe(1);
    expect(screen.getByTestId('signage-slide-canvas')).toBeTruthy();
  });

  it('shows live menu_list content from the shared renderer', () => {
    render(
      <SignageDesigner slide={slide} onChange={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('signage-slide-canvas')).toBeTruthy();
    expect(screen.getByText('Hello Bake & Grill')).toBeTruthy();
    expect(screen.getByText('Chicken Wrap')).toBeTruthy();
  });

  it('exposes auto-menu binding controls and persists them on apply', () => {
    const onChange = vi.fn();
    const autoSlide = {
      id: 'auto-1',
      name: 'Full menu',
      seconds: 12,
      weight: 1,
      transition: 'fade',
      template_origin: 'auto_menu',
      background: { type: 'solid', value: '#1C1408' },
      elements: [{
        id: 'placeholder',
        type: 'text',
        x: 8,
        y: 40,
        w: 84,
        h: 14,
        text: 'Our menu',
        style: {},
        animation: {},
        binding: {
          showcase_cap: 12,
          rows_per_slide: 14,
          showcase_seconds: 10,
          category_seconds: 14,
          show_thumbs: false,
        },
      }],
    };

    render(<SignageDesigner slide={autoSlide} onChange={onChange} onClose={vi.fn()} />);

    expect(screen.getByTestId('signage-auto-menu-controls')).toBeTruthy();
    expect(screen.getByTestId('signage-auto-preview-note')).toBeTruthy();
    expect(screen.queryByTestId('designer-el-placeholder')).toBeNull();

    fireEvent.change(screen.getByTestId('auto-showcase-cap'), { target: { value: '8' } });
    fireEvent.change(screen.getByTestId('auto-rows-per-slide'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('auto-showcase-seconds'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('auto-category-seconds'), { target: { value: '16' } });
    fireEvent.click(screen.getByTestId('auto-show-thumbs'));
    fireEvent.click(screen.getByTestId('signage-designer-apply'));

    expect(onChange).toHaveBeenCalled();
    const saved = onChange.mock.calls[0][0];
    expect(saved.elements[0].binding).toMatchObject({
      showcase_cap: 8,
      rows_per_slide: 10,
      showcase_seconds: 12,
      category_seconds: 16,
      show_thumbs: true,
    });
  });

  it('does not show auto-menu controls on hand-authored slides', () => {
    render(<SignageDesigner slide={slide} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('signage-auto-menu-controls')).toBeNull();
  });
});
