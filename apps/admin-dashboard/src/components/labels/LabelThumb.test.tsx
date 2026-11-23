import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LabelThumb } from './LabelThumb';

describe('LabelThumb', () => {
  it('steps to the next picture when one fails, then to the icon', () => {
    const { container } = render(<LabelThumb srcs={['/gone.png', null, '/brand/amma-logo.png']} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/gone.png');
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brand/amma-logo.png');
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('label-thumb-icon')).toBeTruthy();
  });
});
