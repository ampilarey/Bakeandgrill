import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DishQuestionsPage from '../pages/DishQuestionsPage';
import { answerItemQuestion, fetchItemQuestions } from '../api';

vi.mock('../api', () => ({
  fetchItemQuestions: vi.fn(),
  answerItemQuestion: vi.fn(),
  hideItemQuestion: vi.fn(),
}));

/* Feature 7: staff answer a question about a dish, optionally into its description. */
describe('DishQuestionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchItemQuestions).mockResolvedValue({
      data: [{ id: 4, question: 'Is it spicy?', answer: null, answered_at: null, allergy_note: null, status: 'pending', created_at: '2026-10-17T10:00:00Z', item: { id: 1, name: 'Garudhiya' }, customer: { id: 2, name: 'Aisha' } }],
      meta: { current_page: 1, last_page: 1, total: 1 },
      pending: 1,
    });
    vi.mocked(answerItemQuestion).mockResolvedValue({} as never);
  });

  it('answers and adds to the description', async () => {
    render(<DishQuestionsPage />);
    expect(await screen.findByText('Is it spicy?')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Waiting 1' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'Mild. Chilli on the side.' } });
    fireEvent.click(screen.getByLabelText(/Also add the answer/));
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    await waitFor(() => expect(answerItemQuestion).toHaveBeenCalledWith(4, 'Mild. Chilli on the side.', true));
  });
});
