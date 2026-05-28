import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../components/CommandPalette';
import * as permsHook from '../hooks/usePermissions';
import { vi } from 'vitest';

describe('CommandPalette theme', () => {
  it('uses theme-aware CSS classes on palette shell', () => {
    vi.spyOn(permsHook, 'useCurrentUserPermissions').mockReturnValue({
      user: { id: 1, name: 'O', role: 'owner', permissions: [] } as never,
      loading: false,
      can: () => true,
    });

    const { container } = render(
      <MemoryRouter>
        <CommandPalette open onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(container.querySelector('.command-palette')).toBeTruthy();
    expect(container.querySelector('.command-palette-input')).toBeTruthy();
    expect(container.querySelector('.command-palette-row')).toBeTruthy();
  });

  it('marks selected row with selected class on hover index 0', () => {
    vi.spyOn(permsHook, 'useCurrentUserPermissions').mockReturnValue({
      user: { id: 1, name: 'O', role: 'owner', permissions: [] } as never,
      loading: false,
      can: () => true,
    });

    const { container } = render(
      <MemoryRouter>
        <CommandPalette open onClose={() => {}} />
      </MemoryRouter>,
    );
    const firstRow = container.querySelector('.command-palette-row');
    expect(firstRow?.classList.contains('command-palette-row--selected')).toBe(true);
  });
});
