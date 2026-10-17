import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ItemReviewList } from './ItemReviewList';
import { markReviewHelpful } from '../api';

const auth = { isAuthenticated: true };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ markReviewHelpful: vi.fn() }));
vi.mock('../api/client', () => ({ API_ORIGIN: 'https://shop.test' }));

const review = {
  id: 5, rating: 4, comment: 'Crispy', created_at: '2026-10-17T10:00:00Z', verified: true, helpful_count: 2,
  photos: [{ url: '/api/reviews/5/photos/0', thumb_url: '/api/reviews/5/photos/0?thumb=1' }],
  reply: { text: 'Thank you!', at: null },
};

/* Feature 6: photos, the verified mark, Helpful and the restaurant's reply. */
describe('ItemReviewList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    vi.mocked(markReviewHelpful).mockResolvedValue({ helpful_count: 3, voted: true });
  });

  it('shows the photo, the mark and the reply', () => {
    render(<ItemReviewList reviews={[review]} />);
    expect(screen.getByTestId('review-verified-5')).toHaveTextContent('review.verified');
    expect(screen.getByRole('link', { name: 'review.photo_n' })).toHaveAttribute('href', 'https://shop.test/api/reviews/5/photos/0');
    expect(screen.getByTestId('review-reply-5')).toHaveTextContent('Thank you!');
  });

  it('counts a helpful tap once', async () => {
    render(<ItemReviewList reviews={[review]} />);
    fireEvent.click(screen.getByTestId('review-helpful-5'));
    await waitFor(() => expect(screen.getByTestId('review-helpful-5')).toHaveTextContent('review.helpful · 3'));
    expect(screen.getByTestId('review-helpful-5')).toBeDisabled();
    expect(markReviewHelpful).toHaveBeenCalledTimes(1);
  });

  it('asks a guest to sign in', () => {
    auth.isAuthenticated = false;
    render(<ItemReviewList reviews={[review]} />);
    fireEvent.click(screen.getByTestId('review-helpful-5'));
    expect(screen.getByRole('status')).toHaveTextContent('review.helpful_sign_in');
    expect(markReviewHelpful).not.toHaveBeenCalled();
  });
});
