import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TomorrowOrderingBadge } from './TomorrowOrderingBadge';

describe('TomorrowOrderingBadge', () => {
  it('renders nothing while status is unknown', () => {
    const { container } = render(
      <TomorrowOrderingBadge
        open={null}
        openLabel="Order now for tomorrow"
        closedLabel="Order for tomorrow closed"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows open copy and open class', () => {
    render(
      <TomorrowOrderingBadge
        open
        openLabel="Order now for tomorrow"
        closedLabel="Order for tomorrow closed"
      />,
    );
    const badge = screen.getByTestId('tomorrow-ordering-badge');
    expect(badge).toHaveClass('open');
    expect(badge).not.toHaveClass('closed');
    expect(badge.textContent).toBe('Order now for tomorrow');
  });

  it('shows closed copy and closed class', () => {
    render(
      <TomorrowOrderingBadge
        open={false}
        openLabel="Order now for tomorrow"
        closedLabel="Order for tomorrow closed"
      />,
    );
    const badge = screen.getByTestId('tomorrow-ordering-badge');
    expect(badge).toHaveClass('closed');
    expect(badge.textContent).toBe('Order for tomorrow closed');
  });
});
