import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewsletterPage from '../pages/NewsletterPage';
import { fetchNewsletterIssue, fetchNewsletterIssues, saveNewsletterIssue } from '../api';

vi.mock('../api', () => ({
  fetchNewsletterIssues: vi.fn(),
  fetchNewsletterIssue: vi.fn(),
  fetchNewsletterPreview: vi.fn().mockResolvedValue(new Blob(['<p>x</p>'])),
  fetchNewsletterSubscribers: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }),
  downloadNewsletterSubscribers: vi.fn(),
  fetchPromotions: vi.fn().mockResolvedValue({ data: [] }),
  saveNewsletterIssue: vi.fn(),
  sendNewsletter: vi.fn(),
  sendNewsletterTest: vi.fn(),
  retryNewsletter: vi.fn(),
}));

/* Feature 4: write a newsletter in two languages and save it as a draft. */
describe('NewsletterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.mocked(fetchNewsletterIssues).mockResolvedValue({ issues: [], audience: 12 });
    const issue = {
      id: 3, subject_en: 'October news', subject_dv: '', status: 'draft', sent_at: null, created_at: '', counts: { sent: 0, failed: 0, pending: 0 },
      body_en: '', body_dv: '', header_image_url: null, sections: { new: true }, removed_item_ids: [], picks: { new: [], coming: [], specials: [], offer: null },
    } as const;
    vi.mocked(saveNewsletterIssue).mockResolvedValue({ issue: { ...issue, removed_item_ids: [], picks: { new: [], coming: [], specials: [], offer: null } } });
    vi.mocked(fetchNewsletterIssue).mockResolvedValue({ issue: { ...issue, removed_item_ids: [], picks: { new: [], coming: [], specials: [], offer: null } } });
  });

  it('starts a draft and saves it', async () => {
    render(<NewsletterPage />);
    expect(await screen.findByText(/12 confirmed subscribers/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New newsletter' }));
    fireEvent.change(screen.getByLabelText('Subject (English)'), { target: { value: 'October news' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveNewsletterIssue).toHaveBeenCalledWith(null, expect.objectContaining({ subject_en: 'October news' })));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });
});
