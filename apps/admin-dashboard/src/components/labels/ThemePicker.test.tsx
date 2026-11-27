import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { THEME_FALLBACK, ThemePicker } from './ThemePicker';

// Owner, 2026-11-27: "add more nice themes to each template and custom labels also".
describe('ThemePicker', () => {
  it('offers every theme as a chip, the usual rust picked until another is tapped', () => {
    const onChange = vi.fn();
    render(<ThemePicker value="rust" onChange={onChange} />);
    expect(THEME_FALLBACK.length).toBeGreaterThanOrEqual(10);
    expect(new Set(THEME_FALLBACK.map((t) => t.key)).size).toBe(THEME_FALLBACK.length);
    expect(screen.getByTestId('label-theme-rust')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Forest' }));
    expect(onChange).toHaveBeenCalledWith('forest');
    expect(screen.getByRole('button', { name: 'Black and white' })).toBeInTheDocument();
  });

  it('draws the server\'s list when it has come, and an unknown theme reads as rust', () => {
    render(<ThemePicker value="neon" onChange={() => undefined} themes={[{ key: 'rust', name: 'Rust', accent: '#B74B0C', tint: '#FEF3E8', dark: '#1C1408' }, { key: 'sky', name: 'Sky', accent: '#0F5E8C', tint: '#E9F3F9', dark: '#0A1E2C' }]} />);
    expect(screen.getByRole('button', { name: 'Sky' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Forest' })).toBeNull();
    expect(screen.getByTestId('label-theme-rust')).toHaveAttribute('aria-pressed', 'true');
  });

  it('says a pouch label keeps its pouch colours', () => {
    render(<ThemePicker value="rust" onChange={() => undefined} pouch />);
    expect(screen.getByTestId('label-theme-pouch')).toHaveTextContent('pouch colour');
    expect(screen.queryByTestId('label-theme')).toBeNull();
  });
});
