import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemQuestions } from './ItemQuestions';
import { askItemQuestion, getItemQuestions } from '../api';

const auth = { isAuthenticated: true, authReady: true };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../api', () => ({ getItemQuestions: vi.fn(), askItemQuestion: vi.fn() }));

const renderIt = () => render(<MemoryRouter><ItemQuestions itemId={3} /></MemoryRouter>);

/* Feature 7: ask a question about a dish; answered ones show with the allergy line. */
describe('ItemQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    vi.mocked(getItemQuestions).mockResolvedValue({ questions: [
      { id: 1, question: 'Does it have nuts?', answer: 'No nuts.', answered_at: null, allergy_note: 'x' },
    ] });
    vi.mocked(askItemQuestion).mockResolvedValue({ message: 'ok' });
  });

  it('shows answered questions with the allergy line', async () => {
    renderIt();
    expect(await screen.findByText('Does it have nuts?')).toBeInTheDocument();
    expect(screen.getByText('No nuts.')).toBeInTheDocument();
    expect(screen.getByText('question.allergy')).toBeInTheDocument();
  });

  it('sends a question and thanks the customer', async () => {
    renderIt();
    fireEvent.click(screen.getByTestId('question-ask'));
    fireEvent.change(screen.getByTestId('question-text'), { target: { value: 'Is it spicy?' } });
    fireEvent.click(screen.getByTestId('question-send'));
    await waitFor(() => expect(askItemQuestion).toHaveBeenCalledWith(3, 'Is it spicy?'));
    expect(await screen.findByRole('status')).toHaveTextContent('question.thanks');
  });

  it('asks a guest to sign in', () => {
    auth.isAuthenticated = false;
    renderIt();
    expect(screen.getByTestId('question-sign-in')).toHaveAttribute('href', '/account');
  });
});
