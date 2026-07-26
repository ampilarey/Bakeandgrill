import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PARITY_ITEMS,
  PARITY_MARKERS,
  PARITY_SLIDE,
  PARITY_THEME,
  PARITY_VARIABLES,
  SlideCanvas,
  parityConfig,
} from '@shared/signage';
import '@shared/signage/signage.css';

describe('shared signage renderer parity (order app)', () => {
  it('renders the canonical element-tree with shared SlideCanvas markers', () => {
    const config = parityConfig('landscape');
    render(
      <SlideCanvas
        slide={PARITY_SLIDE}
        theme={PARITY_THEME}
        variables={PARITY_VARIABLES}
        items={PARITY_ITEMS}
        config={config}
      />,
    );

    for (const id of PARITY_MARKERS) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByText('Hello Bake & Grill')).toBeTruthy();
    expect(screen.getByText('Chicken Wrap')).toBeTruthy();
    expect(screen.getByText('45.00/-')).toBeTruthy();
    expect(document.querySelector('.signage-enter-fade')).toBeTruthy();
    expect(document.querySelector('.signage-menu-list')).toBeTruthy();
  });
});
