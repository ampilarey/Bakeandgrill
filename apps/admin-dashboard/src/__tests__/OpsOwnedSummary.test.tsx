import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OpsOwnedSummary } from '../components/OpsOwnedSummary';

describe('OpsOwnedSummary', () => {
  it('shows current value and links to the authoritative Admin page', () => {
    render(
      <MemoryRouter>
        <OpsOwnedSummary
          managedBy={{
            owner_label: 'Ordering Control Center → Delivery Settings',
            owner_path: '/admin/delivery-settings',
            note: 'Free delivery threshold used at checkout.',
            current_value: 'MVR 200',
          }}
          testId="ops-owned-delivery_threshold"
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('ops-owned-delivery_threshold-value')).toHaveTextContent('MVR 200');
    const link = screen.getByTestId('ops-owned-delivery_threshold-link');
    expect(link).toHaveAttribute('href', '/delivery-settings');
    expect(link).toHaveTextContent(/Delivery Settings/);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});
