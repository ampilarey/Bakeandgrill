import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeoSnippetPreview } from '../components/content-editors/SeoSnippetPreview';
import { RevisionDiff } from '../components/content-editors/RevisionDiff';
import { CategoriesEditor } from '../components/content-editors/CategoriesEditor';

describe('Content Studio polish', () => {
  it('shows SEO counters and snippet preview', () => {
    const onTitle = vi.fn();
    const onDesc = vi.fn();
    render(
      <SeoSnippetPreview
        title="Bake & Grill"
        description="Fresh food in Male'"
        onTitleChange={onTitle}
        onDescriptionChange={onDesc}
      />,
    );
    expect(screen.getByTestId('seo-snippet')).toBeTruthy();
    expect(screen.getByText(`${'Bake & Grill'.length}/60`)).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Bake & Grill'), { target: { value: 'New title' } });
    expect(onTitle).toHaveBeenCalledWith('New title');
  });

  it('renders a revision diff', () => {
    render(<RevisionDiff before={'line a\nold'} after={'line a\nnew'} />);
    expect(screen.getByTestId('revision-diff')).toBeTruthy();
    expect(screen.getByText(/− old/)).toBeTruthy();
    expect(screen.getByText(/\+ new/)).toBeTruthy();
  });

  it('persists category image alt text', () => {
    const onChange = vi.fn();
    render(
      <CategoriesEditor
        label="Categories"
        value={JSON.stringify([{ icon: '', label: 'A', name: 'A', hook: '', image_url: '/x.jpg', image_alt: '', link: '/menu' }])}
        onChange={onChange}
        triggerUpload={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Image alt text/i), { target: { value: 'Pastries' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
    expect(JSON.parse(last)[0].image_alt).toBe('Pastries');
  });
});
