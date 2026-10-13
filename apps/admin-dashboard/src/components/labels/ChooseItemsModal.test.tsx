import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Choose which items get labels (round 5, 2026-10-13): every menu item with
 * a tick that saves at once; Done tells the list behind to reload.
 */
const api = vi.hoisted(() => ({ fetchLabelProducts: vi.fn(), updateItemLabel: vi.fn() }));
vi.mock('../../api', () => api);
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { ChooseItemsModal } from './ChooseItemsModal';

const item = (id: number, name: string, on: boolean, extra = {}) => ({ id, name, name_dv: null, label_enabled: on, label_shelf_life_days: on ? 90 : null, ingredients: { from: on ? 'recipe' : 'none', en: '', dv: '', recipe_en: '', recipe_dv: '' }, ...extra });

describe('ChooseItemsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchLabelProducts.mockResolvedValue({ data: [item(7, 'Bajiya', false, { name_dv: 'ބަޖިޔާ' }), item(8, 'Masroshi', true), item(9, 'Gulha', false)] });
    api.updateItemLabel.mockImplementation(async (id: number, body: { label_enabled: boolean }) => ({ data: item(id, id === 7 ? 'Bajiya' : 'Gulha', body.label_enabled) }));
  });

  it('lists every menu item, switches one on at once, finds by name, and Done reloads the list behind', async () => {
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(<ChooseItemsModal onClose={onClose} onChanged={onChanged} />);
    expect(api.fetchLabelProducts).toHaveBeenCalledWith(true);
    const list = await screen.findByTestId('choose-items-list');
    expect(within(list).getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByTestId('choose-items-count')).toHaveTextContent('1 item on labels');
    expect(screen.getByLabelText('Masroshi on labels')).toBeChecked();
    expect(screen.getByLabelText('Bajiya on labels')).not.toBeChecked();

    fireEvent.click(screen.getByLabelText('Bajiya on labels'));
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenCalledWith(7, { label_enabled: true }));
    await waitFor(() => expect(screen.getByLabelText('Bajiya on labels')).toBeChecked());
    expect(screen.getByTestId('choose-items-count')).toHaveTextContent('2 items on labels');

    fireEvent.change(screen.getByLabelText('Find an item'), { target: { value: 'gul' } });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByLabelText('Gulha on labels')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('choose-items-done'));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not reload the list behind when nothing changed', async () => {
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(<ChooseItemsModal onClose={onClose} onChanged={onChanged} />);
    await screen.findByTestId('choose-items-list');
    fireEvent.click(screen.getByTestId('choose-items-done'));
    expect(onChanged).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
