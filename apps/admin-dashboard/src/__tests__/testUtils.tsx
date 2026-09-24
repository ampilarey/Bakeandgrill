import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';

/** Wrap page components that use Link / useSearchParams. */
export function renderWithRouter(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'> & { route?: string }) {
  const { route = '/', ...rest } = options ?? {};
  return render(ui, {
    ...rest,
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
  });
}
