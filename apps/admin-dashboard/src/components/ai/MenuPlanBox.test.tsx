import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/*
 * Owner, 2026-11-24: "Is there any way to upload recommended menu and category so api can
 * rethink about that before suggestions" → "File upload" → "Both".
 */

const fetchMenuPlan = vi.fn();
const saveMenuPlan = vi.fn();
const readMenuPlanFile = vi.fn();
vi.mock('../../api/ai', () => ({
  fetchMenuPlan: (...a: unknown[]) => fetchMenuPlan(...a),
  saveMenuPlan: (...a: unknown[]) => saveMenuPlan(...a),
  readMenuPlanFile: (...a: unknown[]) => readMenuPlanFile(...a),
}));

import { MenuPlanBox } from './MenuPlanBox';

describe('Your plan for the menu', () => {
  beforeEach(() => { vi.clearAllMocks(); fetchMenuPlan.mockResolvedValue({ plan: '' }); });

  it('saves a typed plan and says to press Look now', async () => {
    saveMenuPlan.mockResolvedValue({ plan: 'Snacks\n  Momo' });
    render(<MenuPlanBox />);
    const box = await screen.findByTestId('menu-plan-text');
    expect(screen.getByTestId('menu-plan-save')).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Snacks\n  Momo' } });
    fireEvent.click(screen.getByTestId('menu-plan-save'));
    await waitFor(() => expect(saveMenuPlan).toHaveBeenCalledWith('Snacks\n  Momo'));
    expect(await screen.findByTestId('menu-plan-note')).toHaveTextContent('Plan saved. Press Look now to use it.');
    expect(screen.getByText('in use')).toBeInTheDocument();
    // Saved, so there is nothing to save again, and it can be removed.
    expect(screen.getByTestId('menu-plan-save')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove plan' })).toBeInTheDocument();
  });

  it('a file only fills the box: nothing is kept until Save plan', async () => {
    readMenuPlanFile.mockResolvedValue({ plan: 'Drinks\n  Fresh juices' });
    render(<MenuPlanBox />);
    const file = new File(['x'], 'menu.jpg', { type: 'image/jpeg' });
    fireEvent.change(await screen.findByTestId('menu-plan-file'), { target: { files: [file] } });
    await waitFor(() => expect(readMenuPlanFile).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getByTestId('menu-plan-text')).toHaveValue('Drinks\n  Fresh juices'));
    expect(screen.getByTestId('menu-plan-note')).toHaveTextContent('Read from the file. Check it');
    expect(saveMenuPlan).not.toHaveBeenCalled();
    expect(screen.getByTestId('menu-plan-save')).toBeEnabled();
  });

  it('says what went wrong with a file, and shows nothing to someone the server refuses', async () => {
    readMenuPlanFile.mockRejectedValue(new Error('The assistant could not read a menu plan from this file.'));
    const first = render(<MenuPlanBox />);
    fireEvent.change(await screen.findByTestId('menu-plan-file'), { target: { files: [new File(['x'], 'cat.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('could not read a menu plan');
    first.unmount();

    fetchMenuPlan.mockRejectedValue(new Error('Forbidden'));
    const { container } = render(<MenuPlanBox />);
    await waitFor(() => expect(fetchMenuPlan).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
