import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignageDesigner } from '../pages/signage/SignageDesigner';

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
    expect(screen.getByTestId(/designer-el-/)).toBeTruthy();
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
});
