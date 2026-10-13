import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelTemplate } from '../../api';

/*
 * Templates under Wording and logos (round 7, 2026-10-13): the saved ones
 * first (renamed in place, removed after asking), the built-in ones beneath,
 * and any of them starts a new custom label.
 */
const api = vi.hoisted(() => ({ fetchLabelTemplates: vi.fn(), updateLabelTemplate: vi.fn(), deleteLabelTemplate: vi.fn() }));
vi.mock('../../api', () => api);
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});
vi.mock('./CustomLabels', () => ({ CustomLabelModal: ({ startFrom }: { startFrom?: LabelTemplate | null }) => <div data-testid="custom-label-modal">{startFrom?.name}</div> }));

import { LabelTemplatesCard } from './LabelTemplatesCard';

const tpl = (id: number | string, name: string, builtin: boolean, extra: Partial<LabelTemplate> = {}): LabelTemplate => ({
  id, builtin, name, blurb: builtin ? 'A chilled sauce in a jar.' : null, source: builtin ? null : 'Garlic Sauce',
  fields: { label_storage: 'chilled', label_shelf_life_days: 14, label_pack_unit: 'ML' }, wrap_pictures: [], size: { shape: 'rect', preset: 'r60x40', on: 'sheet', w: 60, h: 40 },
  type_name: 'Chilled Hedhika', brand_name: 'Amma', footer_name: null, storage: 'chilled', created_by: null, created_at: null, ...extra,
});

describe('LabelTemplatesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchLabelTemplates.mockResolvedValue({ data: [tpl(4, 'Jar sauce', false)], builtin: [tpl('sauce-jar', 'Sauce or dip in a jar', true)] });
    api.updateLabelTemplate.mockImplementation(async (id: number, body: { name: string }) => ({ data: tpl(id, body.name, false) }));
    api.deleteLabelTemplate.mockResolvedValue({ ok: true });
  });

  it('lists your templates then the built-in ones, renames in place, starts a label from one and removes one after asking', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LabelTemplatesCard canManage />);
    const list = await screen.findByTestId('label-templates');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Jar sauce');
    expect(rows[0]).toHaveTextContent('Chilled · Chilled Hedhika · Amma · keeps 14 days · ML · 60 × 40 mm · from Garlic Sauce');
    expect(rows[1]).toHaveTextContent('Sauce or dip in a jar');
    expect(rows[1]).toHaveTextContent('Built in');
    expect(rows[1]).toHaveTextContent('A chilled sauce in a jar.');
    expect(within(rows[1]).queryByRole('button', { name: /^Remove/ })).toBeNull();

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Rename Jar sauce' }));
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'Sauces' } });
    fireEvent.submit(screen.getByTestId('inline-rename'));
    await waitFor(() => expect(api.updateLabelTemplate).toHaveBeenCalledWith(4, { name: 'Sauces' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Sauces'));

    fireEvent.click(within(rows[1]).getByRole('button', { name: 'New label from Sauce or dip in a jar' }));
    expect(screen.getByTestId('custom-label-modal')).toHaveTextContent('Sauce or dip in a jar');

    fireEvent.click(within(list).getAllByRole('listitem')[0].querySelector('button[aria-label="Remove Sauces"]') as HTMLElement);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove the template "Sauces"?'));
    await waitFor(() => expect(api.deleteLabelTemplate).toHaveBeenCalledWith(4));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('No templates of your own yet');
    confirm.mockRestore();
  });

  it('shows the list read-only without Manage label settings', async () => {
    render(<LabelTemplatesCard canManage={false} />);
    const list = await screen.findByTestId('label-templates');
    expect(within(list).queryByRole('button')).toBeNull();
    expect(list).toHaveTextContent('Jar sauce');
  });
});
