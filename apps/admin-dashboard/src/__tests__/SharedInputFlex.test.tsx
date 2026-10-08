import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../components/SharedUI';

// A caller's flex sizing belongs on Input's wrapper. Writing the unset
// longhands too (flexGrow: undefined after flex) cleared the shorthand, so
// the wrapper never grew and the menu photo address stayed a stub on phones.
describe('Input flex sizing', () => {
  it('keeps the flex the caller asked for on the wrapper', () => {
    const { container } = render(<Input value="" onChange={() => {}} style={{ flex: '1 1 100%' }} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.flexGrow).toBe('1');
    expect(wrapper.style.flexBasis).toBe('100%');
    expect((container.querySelector('input') as HTMLInputElement).style.width).toBe('100%');
  });

  it('leaves the wrapper alone when no flex is asked for', () => {
    const { container } = render(<Input value="" onChange={() => {}} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.flexGrow).toBe('');
    expect(wrapper.style.minWidth).toBe('');
  });
});
