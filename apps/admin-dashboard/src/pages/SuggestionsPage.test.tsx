import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fetchAiSuggestions = vi.fn();
const lookForSuggestions = vi.fn();
const decideSuggestions = vi.fn();
vi.mock('../api/ai', () => ({
  fetchAiSuggestions: (...a: unknown[]) => fetchAiSuggestions(...a),
  lookForSuggestions: (...a: unknown[]) => lookForSuggestions(...a),
  decideSuggestions: (...a: unknown[]) => decideSuggestions(...a),
}));

import SuggestionsPage from './SuggestionsPage';

const kinds = [
  { key: 'menu_dhivehi', label: 'Dhivehi for dishes', about: 'Dishes with no Dhivehi.', can_approve: true, on: true, rows: [
    { id: 1, subject_id: 5, subject: 'Chicken Momo', before: null, proposed: { name_dv: 'ކުކުޅު މޯމޯ' }, reason: null, made: '2026-11-24' },
    { id: 2, subject_id: 6, subject: 'Bajiya', before: null, proposed: { name_dv: 'ބާޖިޔާ' }, reason: null, made: '2026-11-24' },
  ] },
  { key: 'inventory_duplicate', label: 'Inventory items that look alike', about: 'Nothing is merged for you.', can_approve: false, on: true, rows: [
    { id: 3, subject_id: 9, subject: 'Butter (kg)', before: null, proposed: { other_id: 10, other: 'Buttr 500g (kg)' }, reason: 'Same product', made: '2026-11-24' },
  ] },
];

describe('System → Integrations → Suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAiSuggestions.mockResolvedValue({ kinds, ready: true });
  });

  it('approves only what is ticked, with the reworded Dhivehi, and says what happened', async () => {
    decideSuggestions.mockResolvedValue({ approved: 1, rejected: 0, stale: 0 });
    render(<MemoryRouter><SuggestionsPage /></MemoryRouter>);
    expect(await screen.findByText('Nothing here has been changed.')).toBeInTheDocument();

    // Nothing ticked: nothing to approve.
    expect(screen.getByTestId('sg-approve-menu_dhivehi')).toBeDisabled();
    fireEvent.change(screen.getByTestId('sg-edit-1-name_dv'), { target: { value: 'ކުކުޅު މޯމޯސް' } });
    fireEvent.click(screen.getByTestId('sg-tick-1'));
    fireEvent.click(screen.getByTestId('sg-approve-menu_dhivehi'));

    await waitFor(() => expect(decideSuggestions).toHaveBeenCalledWith({ approve: [1], edits: { 1: { name_dv: 'ކުކުޅު މޯމޯސް' } } }));
    expect(await screen.findByTestId('sg-note')).toHaveTextContent('1 approved.');
    expect(fetchAiSuggestions).toHaveBeenCalledTimes(2);
  });

  it('a kind that cannot be applied offers Dismiss only, and Look now asks for that kind', async () => {
    decideSuggestions.mockResolvedValue({ approved: 0, rejected: 1, stale: 0 });
    lookForSuggestions.mockResolvedValue({ made: 2 });
    render(<MemoryRouter><SuggestionsPage /></MemoryRouter>);
    await screen.findByText('Butter (kg)');
    expect(screen.queryByTestId('sg-approve-inventory_duplicate')).toBeNull();
    fireEvent.click(screen.getByTestId('sg-tick-3'));
    fireEvent.click(screen.getByTestId('sg-reject-inventory_duplicate'));
    await waitFor(() => expect(decideSuggestions).toHaveBeenCalledWith({ reject: [3] }));
    expect(await screen.findByTestId('sg-note')).toHaveTextContent('1 dismissed.');

    fireEvent.click(screen.getByTestId('sg-look-menu_dhivehi'));
    await waitFor(() => expect(lookForSuggestions).toHaveBeenCalledWith('menu_dhivehi'));
    await waitFor(() => expect(screen.getByTestId('sg-note')).toHaveTextContent('2 new suggestions for dhivehi for dishes.'));
  });

  // Owner, 2026-11-24: "arrange and add new category and subcategory and add related items to that".
  it('a new section can be renamed and a dish unticked before it is approved', async () => {
    fetchAiSuggestions.mockResolvedValue({ ready: true, kinds: [
      { key: 'menu_section', label: 'New sections', about: 'A new section or sub-section.', can_approve: true, on: true, rows: [
        { id: 7, subject_id: null, subject: 'Momo', before: { from: { 5: 2, 6: 2, 8: 2 } }, reason: 'Three momo dishes together', made: '2026-11-24',
          proposed: { name: 'Momo', parent_id: 2, parent: 'Snacks', item_ids: [5, 6, 8], items: [{ id: 5, name: 'Chicken Momo', in: 'Snacks' }, { id: 6, name: 'Beef Momo', in: 'Snacks' }, { id: 8, name: 'Momo Sauce', in: 'Snacks' }] } },
      ] },
    ] });
    decideSuggestions.mockResolvedValue({ approved: 1, rejected: 0, stale: 0 });
    render(<MemoryRouter><SuggestionsPage /></MemoryRouter>);

    expect(await screen.findByText('Snacks', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Dishes to move in (3 of 3)')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('sg-edit-7-name'), { target: { value: 'Momos' } });
    fireEvent.click(screen.getByTestId('sg-dish-7-8'));
    expect(screen.getByText('Dishes to move in (2 of 3)')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sg-tick-7'));
    fireEvent.click(screen.getByTestId('sg-approve-menu_section'));
    await waitFor(() => expect(decideSuggestions).toHaveBeenCalledWith({ approve: [7], edits: { 7: { name: 'Momos', skip: '8' } } }));
  });
});
