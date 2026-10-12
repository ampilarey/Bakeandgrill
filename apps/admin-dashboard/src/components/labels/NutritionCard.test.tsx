import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchLabelNutrition = vi.fn();
const saveIngredientNutrition = vi.fn();

vi.mock('../../api', () => ({
  NUTRITION_KEYS: ['kcal', 'fat', 'sat_fat', 'carbs', 'sugars', 'protein', 'salt'],
  fetchLabelNutrition: (...a: unknown[]) => fetchLabelNutrition(...a),
  saveIngredientNutrition: (...a: unknown[]) => saveIngredientNutrition(...a),
}));

vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { NutritionCard, panelWords } from './NutritionCard';

const FIELDS = { kcal: 'Energy (kcal)', fat: 'Fat (g)', sat_fat: 'of which saturates (g)', carbs: 'Carbohydrate (g)', sugars: 'of which sugars (g)', protein: 'Protein (g)', salt: 'Salt (g)' };
const flour = { id: 1, name: 'Flour', unit: 'g', nutrition: { kcal: 364, fat: 1, sat_fat: 0.2, carbs: 76, sugars: 0.3, protein: 10, salt: 0 }, used_by: ['Bajiya'] };
const tuna = { id: 2, name: 'Smoked tuna', unit: 'g', nutrition: null, used_by: ['Bajiya', 'Gulha'] };
const bajiya = { id: 9, name: 'Bajiya', show: true, complete: false, per100: {}, grams: 705, missing: ['Smoked tuna'], unweighed: [] };

/*
 * The nutrition card (round C): ingredients still without values first,
 * each a row of seven boxes and Save; the rest behind Show all; each
 * product's standing behind a toggle.
 */
describe('NutritionCard', () => {
  beforeEach(() => {
    [fetchLabelNutrition, saveIngredientNutrition].forEach((f) => f.mockReset());
    fetchLabelNutrition.mockResolvedValue({ data: [flour, tuna], products: [bajiya], fields: FIELDS });
  });

  it('asks for the values of ingredients without any and saves them per 100 g', async () => {
    saveIngredientNutrition.mockResolvedValue({ data: { ...tuna, nutrition: { kcal: 132, fat: 1.3, sat_fat: 0.4, carbs: 0, sugars: 0, protein: 29, salt: 1.5 } } });
    render(<NutritionCard canManage />);
    expect(await screen.findByText('Needs values (1)')).toBeInTheDocument();
    // Only the tuna shows until Show all; the flour has its values.
    expect(screen.getByText('Smoked tuna')).toBeInTheDocument();
    expect(screen.queryByText('Flour')).not.toBeInTheDocument();
    expect(screen.getByText('used by Bajiya, Gulha')).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save values for Smoked tuna' });
    expect(save).toBeDisabled();
    // Fat without the kcal is refused before it is sent.
    fireEvent.change(screen.getByLabelText('Smoked tuna: Fat g per 100 g'), { target: { value: '1.3' } });
    expect(save).toBeDisabled();
    expect(screen.getByText('Type the kcal too.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Smoked tuna: kcal per 100 g'), { target: { value: '132' } });
    fireEvent.change(screen.getByLabelText('Smoked tuna: Protein g per 100 g'), { target: { value: '29' } });
    fireEvent.change(screen.getByLabelText('Smoked tuna: Salt g per 100 g'), { target: { value: '1.5' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(saveIngredientNutrition).toHaveBeenCalledWith(2, { kcal: 132, fat: 1.3, sat_fat: null, carbs: null, sugars: null, protein: 29, salt: 1.5 }));
    // The products' standing is read again after a save.
    await waitFor(() => expect(fetchLabelNutrition).toHaveBeenCalledTimes(2));
  });

  it('lists every ingredient behind Show all and each product\'s standing behind a toggle', async () => {
    render(<NutritionCard canManage={false} />);
    await screen.findByText('Needs values (1)');
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2 ingredients' }));
    expect(screen.getByText('Flour')).toBeInTheDocument();
    expect(screen.getByLabelText('Flour: kcal per 100 g')).toHaveValue(364);
    expect(screen.getByLabelText('Flour: kcal per 100 g')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save values for Flour' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nutrition-products-toggle'));
    expect(screen.getByTestId('nutrition-products')).toHaveTextContent('Bajiya · needs values for Smoked tuna');
    expect(screen.getByTestId('nutrition-products-toggle')).toHaveTextContent('0 of 1 product has a panel');
  });

  it('words a product\'s panel', () => {
    expect(panelWords({ ...bajiya, complete: true, per100: { kcal: 296, fat: 1.1, carbs: 53.9, protein: 15.3, salt: 1.1 }, missing: [], show: false }))
      .toBe('296 kcal · fat 1.1 g · carbs 53.9 g · protein 15.3 g · salt 1.1 g per 100 g · not switched on for the sticker');
    expect(panelWords({ ...bajiya, missing: ['Salt'], unweighed: ['Egg'] })).toBe('needs values for Salt; Egg not in grams');
  });
});
