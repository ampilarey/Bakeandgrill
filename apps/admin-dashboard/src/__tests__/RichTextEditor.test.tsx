import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RichTextEditor } from '../components/content-editors/RichTextEditor';

describe('RichTextEditor', () => {
  it('renders a contenteditable surface and emits on input', () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="Headline" value="<p>Hello</p>" onChange={onChange} />);

    const editor = screen.getByTestId('rich-text-editor');
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(screen.getByText('Bold')).toBeTruthy();
    expect(screen.getByText('Italic')).toBeTruthy();

    fireEvent.input(editor, { target: { innerHTML: '<p>Hello <strong>world</strong></p>' } });
    // contentEditable input uses ref.innerHTML — simulate via onInput path
    editor.innerHTML = '<p>Hello <strong>world</strong></p>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalled();
  });
});
