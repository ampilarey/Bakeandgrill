import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoriesEditor } from '../components/content-editors/CategoriesEditor';
import { TrustItemsEditor } from '../components/content-editors/TrustItemsEditor';
import { HeroSlidesEditor } from '../components/content-editors/HeroSlidesEditor';

describe('unlimited content editors', () => {
  it('allows adding more than four categories and reordering via move buttons', () => {
    const onChange = vi.fn();
    const initial = JSON.stringify([
      { icon: '', label: 'A', name: 'A', hook: '', image_url: '', link: '/menu' },
      { icon: '', label: 'B', name: 'B', hook: '', image_url: '', link: '/menu' },
      { icon: '', label: 'C', name: 'C', hook: '', image_url: '', link: '/menu' },
      { icon: '', label: 'D', name: 'D', hook: '', image_url: '', link: '/menu' },
    ]);

    render(
      <CategoriesEditor
        label="Categories"
        value={initial}
        onChange={onChange}
        triggerUpload={() => {}}
      />,
    );

    expect(screen.getAllByTestId('repeater-row')).toHaveLength(4);
    fireEvent.click(screen.getByTestId('repeater-add'));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
    expect(JSON.parse(last)).toHaveLength(5);

    onChange.mockClear();
    fireEvent.click(screen.getAllByLabelText('Move category down')[0]);
    const reordered = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string);
    expect(reordered[0].label).toBe('B');
    expect(reordered[1].label).toBe('A');
  });

  it('duplicates a trust item without capping', () => {
    const onChange = vi.fn();
    render(
      <TrustItemsEditor
        label="Trust"
        value={JSON.stringify([{ icon: '1', heading: 'One', subtext: 'a' }])}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Duplicate trust item'));
    const next = JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string);
    expect(next).toHaveLength(2);
    expect(next[1].heading).toBe('One');
  });

  it('hero slides editor manages an unbounded array', () => {
    const onChange = vi.fn();
    render(
      <HeroSlidesEditor
        label="Hero Slides"
        value={JSON.stringify([{ title: 'Slide 1', eyebrow: 'E', image: '', subtitle: '', cta_text: '', cta_url: '', cta2_text: '', cta2_url: '' }])}
        onChange={onChange}
        triggerUpload={() => {}}
      />,
    );

    expect(screen.getByDisplayValue('Slide 1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('repeater-add'));
    expect(JSON.parse(onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string)).toHaveLength(2);
  });
});
