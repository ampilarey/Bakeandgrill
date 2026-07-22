import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CategoryShortcuts } from './CategoryShortcuts';

describe('CategoryShortcuts alt text', () => {
  it('uses image_alt when provided', () => {
    render(
      <MemoryRouter>
        <CategoryShortcuts
          categories={[
            {
              name: 'Grills',
              label: 'Hot',
              image_url: '/storage/site/grill.jpg',
              image_alt: 'Charcoal grills',
              link: '/menu',
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByAltText('Charcoal grills')).toBeTruthy();
  });
});
