import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhotoDropZone, fileMatchesAccept } from './PhotoDropZone';

/* Owner, 2026-11-08: "can u add photo drop option?" */
const file = (name: string, type: string) => new File(['x'], name, { type });
const drag = (files: File[]) => ({ dataTransfer: { files, types: ['Files'], dropEffect: 'none' } });

describe('PhotoDropZone', () => {
  it('matches files against an accept list by type, wildcard or ending', () => {
    expect(fileMatchesAccept(file('a.jpg', 'image/jpeg'), 'image/*,.heic')).toBe(true);
    expect(fileMatchesAccept(file('a.HEIC', ''), 'image/*,.heic')).toBe(true);
    expect(fileMatchesAccept(file('a.pdf', 'application/pdf'), 'image/*,.heic')).toBe(false);
    expect(fileMatchesAccept(file('a.jpg', 'image/jpeg'), 'image/png,.png')).toBe(false);
  });

  it('lights up while a file is over it and hands a dropped photo to the upload', () => {
    const onFile = vi.fn();
    render(<PhotoDropZone onFile={onFile}><button type="button">Upload &amp; crop</button></PhotoDropZone>);
    const zone = screen.getByTestId('photo-drop-zone');
    const photo = file('bajiya.jpg', 'image/jpeg');

    fireEvent.dragEnter(zone, drag([photo]));
    expect(screen.getByText('Drop the photo here')).toBeInTheDocument();
    fireEvent.drop(zone, drag([photo]));
    expect(onFile).toHaveBeenCalledWith(photo);
    expect(screen.queryByText('Drop the photo here')).toBeNull();
  });

  it('refuses a file the box does not take and ignores drops while busy', () => {
    const onFile = vi.fn();
    const onReject = vi.fn();
    const { rerender } = render(<PhotoDropZone onFile={onFile} onReject={onReject} accept="image/png,.png"><span>box</span></PhotoDropZone>);
    fireEvent.drop(screen.getByTestId('photo-drop-zone'), drag([file('menu.pdf', 'application/pdf')]));
    expect(onFile).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('menu.pdf'));

    rerender(<PhotoDropZone onFile={onFile} onReject={onReject} disabled><span>box</span></PhotoDropZone>);
    fireEvent.drop(screen.getByTestId('photo-drop-zone'), drag([file('a.png', 'image/png')]));
    expect(onFile).not.toHaveBeenCalled();
  });
});
