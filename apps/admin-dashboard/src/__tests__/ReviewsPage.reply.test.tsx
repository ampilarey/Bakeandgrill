import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReviewsPage from '../pages/ReviewsPage';
import { fetchAdminReviews, replyToReview, type Review } from '../api';

vi.mock('../api', () => ({
  fetchAdminReviews: vi.fn(),
  moderateReview: vi.fn(),
  replyToReview: vi.fn(),
  fetchReviewPhoto: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' })),
}));

const review: Review = {
  id: 9, rating: 2, comment: 'Too salty', type: 'item', status: 'approved', is_anonymous: false,
  author: 'Aisha', item: { id: 1, name: 'Mas riha' }, order: { id: 4, order_number: 'BG-0004' },
  created_at: '2026-10-17T10:00:00Z', verified: true, helpful_count: 3, reply: null,
  photos: [{ url: '/api/reviews/9/photos/0', thumb_url: '/api/reviews/9/photos/0?thumb=1' }],
};

/* Feature 6: the restaurant replies, and staff see photos, the verified mark and helpful votes. */
describe('ReviewsPage reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.mocked(fetchAdminReviews).mockResolvedValue({ data: [review], meta: { current_page: 1, last_page: 1, total: 1 } });
    vi.mocked(replyToReview).mockResolvedValue({ review: { ...review, reply: { text: 'Sorry', at: null } } });
  });

  it('shows the marks and photos, and saves a reply', async () => {
    render(<MemoryRouter><ReviewsPage /></MemoryRouter>);
    expect((await screen.findAllByText('Verified order')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 found it helpful').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByLabelText('Photo 1').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
    fireEvent.change(screen.getByTestId('review-reply-text'), { target: { value: '  Sorry, we told the kitchen.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reply' }));
    await waitFor(() => expect(replyToReview).toHaveBeenCalledWith(9, 'Sorry, we told the kitchen.'));
  });
});
