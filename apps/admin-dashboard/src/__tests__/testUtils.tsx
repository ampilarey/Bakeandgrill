import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';

/** Wrap page components that use Link / useSearchParams. */
export function renderWithRouter(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
    ),
  });
}
