import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InboxList } from '../components/InboxList';

/* Feature 14: the Needs attention rows, and the empty state. */
describe('InboxList', () => {
  it('links each row to its page', () => {
    render(<MemoryRouter><InboxList rows={[{ key: 'reviews', label: 'Reviews waiting for moderation', count: 3, link: '/customers/reviews', level: 'info' }]} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Reviews waiting for moderation/ })).toHaveAttribute('href', '/customers/reviews');
  });

  it('says so when nothing waits', () => {
    render(<MemoryRouter><InboxList rows={[]} /></MemoryRouter>);
    expect(screen.getByTestId('inbox-empty')).toHaveTextContent('Nothing waiting. Good job.');
  });
});
