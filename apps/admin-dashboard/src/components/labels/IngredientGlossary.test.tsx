import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchLabelGlossary = vi.fn();
const saveGlossaryWord = vi.fn();
const updateGlossaryWord = vi.fn();
const deleteGlossaryWord = vi.fn();

vi.mock('../../api', () => ({
  fetchLabelGlossary: (...a: unknown[]) => fetchLabelGlossary(...a),
  saveGlossaryWord: (...a: unknown[]) => saveGlossaryWord(...a),
  updateGlossaryWord: (...a: unknown[]) => updateGlossaryWord(...a),
  deleteGlossaryWord: (...a: unknown[]) => deleteGlossaryWord(...a),
}));

vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { IngredientGlossary } from './IngredientGlossary';

const words = [
  { id: 1, en: 'flour', word: 'flour', dv: 'ފުށް' },
  { id: 2, en: 'salt', word: 'salt', dv: 'ލޮނު' },
];

/*
 * The ingredient glossary card (2026-10-12): the words a label needs and
 * has no Dhivehi for come first, with a box to type it; the list behind
 * Show all; a new word from the add row.
 */
describe('IngredientGlossary', () => {
  beforeEach(() => {
    [fetchLabelGlossary, saveGlossaryWord, updateGlossaryWord, deleteGlossaryWord].forEach((f) => f.mockReset());
    fetchLabelGlossary.mockResolvedValue({ data: words, missing: [{ word: 'dragon spice', products: ['Bajiya', 'Gulha'] }] });
    saveGlossaryWord.mockResolvedValue({ data: { id: 3, en: 'dragon spice', word: 'dragon spice', dv: 'ޑްރެގަން' } });
    updateGlossaryWord.mockResolvedValue({ data: words[0] });
  });

  it('asks for the Dhivehi of words labels need and saves it as a word', async () => {
    render(<IngredientGlossary canManage />);
    expect(await screen.findByText('Needs Dhivehi (1)')).toBeInTheDocument();
    expect(screen.getByText('Bajiya, Gulha')).toBeInTheDocument();
    const box = screen.getByLabelText('Dhivehi for dragon spice');
    expect(screen.getByRole('button', { name: 'Save Dhivehi for dragon spice' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'ޑްރެގަން' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Dhivehi for dragon spice' }));
    await waitFor(() => expect(saveGlossaryWord).toHaveBeenCalledWith({ en: 'dragon spice', dv: 'ޑްރެގަން' }));
    expect(fetchLabelGlossary).toHaveBeenCalledTimes(2);
  });

  it('lists the words behind Show all, edits one in place and adds a new one', async () => {
    render(<IngredientGlossary canManage />);
    await screen.findByText('Needs Dhivehi (1)');
    expect(screen.queryByTestId('glossary-words')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2 words' }));
    expect(screen.getByTestId('glossary-words')).toBeInTheDocument();
    const salt = screen.getByLabelText('Dhivehi for salt');
    fireEvent.change(salt, { target: { value: 'ލޮނު (ކަނޑު)' } });
    fireEvent.blur(salt);
    await waitFor(() => expect(updateGlossaryWord).toHaveBeenCalledWith(2, { dv: 'ލޮނު (ކަނޑު)' }));

    fireEvent.change(screen.getByLabelText('English'), { target: { value: 'Cashew nuts' } });
    fireEvent.change(screen.getByLabelText('Dhivehi'), { target: { value: 'ކެޝޫ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add word' }));
    await waitFor(() => expect(saveGlossaryWord).toHaveBeenCalledWith({ en: 'Cashew nuts', dv: 'ކެޝޫ' }));
  });

  it('is read only without Manage label settings', async () => {
    render(<IngredientGlossary canManage={false} />);
    await screen.findByText('Needs Dhivehi (1)');
    expect(screen.getByLabelText('Dhivehi for dragon spice')).toBeDisabled();
    expect(screen.queryByTestId('glossary-add')).not.toBeInTheDocument();
  });
});
