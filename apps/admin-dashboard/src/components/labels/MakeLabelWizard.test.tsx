import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelPreset } from '../../api';

/*
 * Make a label in four steps (owner, 2026-10-13): a menu item not yet on
 * labels is switched on when picked; a picture card picks the size; the
 * preview draws from the same sticker request Print labels makes; Print
 * prepares the sheet with the copies asked for and opens it.
 */
const api = vi.hoisted(() => ({
  fetchLabelLayouts: vi.fn(),
  fetchLabelProducts: vi.fn(),
  fetchCustomLabels: vi.fn(),
  fetchLabelTypes: vi.fn(),
  fetchLabelBrands: vi.fn(),
  fetchLabelFooters: vi.fn(),
  stickerLinks: vi.fn(),
  updateItemLabel: vi.fn(),
  updateCustomLabel: vi.fn(),
  createLabelTemplate: vi.fn(),
  openLabelSheet: vi.fn(),
  downloadLabelSheet: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('./CustomLabels', () => ({ CustomLabelModal: () => null, langOf: () => 'en' }));
vi.mock('./ItemLabelTab', () => ({ ItemLabelTab: () => null }));
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { MakeLabelWizard } from './MakeLabelWizard';

const rect = (id: string, w: number, h: number, design: LabelPreset['design'], perPage: number): LabelPreset => ({
  id, shape: 'rect', w, h, name: `${w} × ${h} mm`, cm: '', design,
  options: [
    { on: 'sheet', layout: id === 'r105x148' ? 'a4-4' : 'a4-custom', label: 'A4 sheet', per_page: perPage, landscape: false },
    { on: 'printer', layout: id === 'r105x148' ? 'single-105x148' : 'single-custom', label: 'Label printer', per_page: 1, landscape: false },
  ],
});
const presets: LabelPreset[] = [
  rect('r105x148', 105, 148.5, 'full', 4),
  rect('r99x70', 99, 70.5, 'mini', 8),
  rect('r60x40', 60, 40, 'small', 18),
  rect('r40x30', 40, 30, 'small', 35),
  { id: 'c60', shape: 'circle', w: 60, h: 60, name: 'Round 60 mm', cm: '', design: 'round', options: [{ on: 'sheet', layout: 'a4-round-custom', label: 'A4 sheet', per_page: 12, landscape: false }, { on: 'printer', layout: 'single-round-custom', label: 'Label printer', per_page: 1, landscape: false }] },
  rect('r180x40', 180, 40, 'wrap', 7),
];
const limits = { min_short: 20, min_long: 30, max_w: 210, max_h: 297, min_round: 30, max_round: 200, sheet_margin: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.fetchLabelLayouts.mockResolvedValue({ data: [], presets, limits, wrap: { parts: [], marks: [], default_parts: [], default_marks: [], max_pictures: 4 } });
  api.fetchLabelProducts.mockResolvedValue({ data: [
    { id: 7, name: 'Bajiya', name_dv: 'ބަޖިޔާ', label_enabled: false },
    { id: 8, name: 'Masroshi', name_dv: null, label_enabled: true, label_storage: 'frozen', label_shelf_life_days: 90, label_pack_unit: 'PCS' },
  ] });
  api.fetchCustomLabels.mockResolvedValue({ data: [] });
  api.fetchLabelTypes.mockResolvedValue({ data: [] });
  api.fetchLabelBrands.mockResolvedValue({ data: [] });
  api.fetchLabelFooters.mockResolvedValue({ data: [] });
  api.updateItemLabel.mockResolvedValue({ data: { id: 7, label_enabled: true } });
  api.stickerLinks.mockImplementation(async (body: { preview?: boolean }) => ({
    url: body.preview ? '/labels/stickers?preview=1&signature=p' : '/labels/stickers?print=1&signature=x',
    one_url: body.preview ? '/labels/stickers?preview=1&one=1&signature=p' : null,
    view_url: '/labels/stickers?signature=x', pdf_url: '/labels/stickers.pdf?signature=x', expires_in_minutes: 30,
    job: body.preview ? undefined : { id: 3, name: 'Bajiya · 60 × 40 mm' },
    summary: {
      layout: 'a4-custom', label: '', design: 'small', w: 60, h: 40, stickers: 18, pages: 1, per_page: 18, products: [],
      spots: [{ key: 'name', x: 2, y: 10, w: 56, h: 8 }, { key: 'dates', x: 2, y: 22, w: 56, h: 9 }, { key: 'batch', x: 2, y: 33, w: 28, h: 3 }],
    },
  }));
});

function mount() {
  return render(<MemoryRouter><MakeLabelWizard /></MemoryRouter>);
}

describe('MakeLabelWizard', () => {
  it('walks from a menu item to a printed sheet, switching the item on for labels on the way', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    const row = await screen.findByRole('button', { name: /Bajiya/ });
    expect(row).toHaveTextContent('Not on labels yet');
    fireEvent.click(row);
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenCalledWith(7, { label_enabled: true }));

    // Step 2: the picture cards, with their sizes.
    const cards = await screen.findByRole('group', { name: 'Which label' });
    expect(within(cards).getByRole('button', { name: /Jar or tub/ })).toHaveTextContent('60 × 40 mm');
    expect(within(cards).getByRole('button', { name: /Round lid/ })).toHaveTextContent('Ø 60 mm');
    expect(within(cards).getByRole('button', { name: /Bottle wrap/ })).toHaveTextContent('180 × 40 mm');
    fireEvent.click(within(cards).getByRole('button', { name: /Jar or tub/ }));
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('60 × 40 mm · small sticker · 18 on A4 sheet');
    fireEvent.click(screen.getByTestId('make-next-2'));

    // Step 3: the preview is drawn from the same request Print labels makes, in both languages for a Dhivehi name.
    await waitFor(() => expect(api.stickerLinks).toHaveBeenCalled());
    expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ items: [{ id: 7, copies: 1, kind: 'item' }], layout: 'a4-custom', w: 60, h: 40, lang: 'both', fill: true, preview: true }));
    await waitFor(() => expect(screen.getByTitle('The label')).toHaveAttribute('src', expect.stringContaining('one=1')));
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en', preview: true })));
    fireEvent.click(screen.getByTestId('make-next-3'));

    // Step 4: a sheet's worth to start with, then Print prepares and opens it.
    expect(screen.getByRole('spinbutton', { name: 'Labels' })).toHaveValue(18);
    fireEvent.click(screen.getByTestId('make-print'));
    await waitFor(() => expect(api.openLabelSheet).toHaveBeenCalledWith('/labels/stickers?print=1&signature=x', '/labels/stickers.pdf?signature=x'));
    expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ items: [{ id: 7, copies: 18, kind: 'item' }], layout: 'a4-custom', lang: 'en' }));
    expect(api.stickerLinks.mock.calls[api.stickerLinks.mock.calls.length - 1]?.[0]).not.toHaveProperty('preview', true);
    expect(screen.getByTestId('make-done')).toHaveTextContent('Saved as "Bajiya · 60 × 40 mm" under Saved labels');
    expect(JSON.parse(window.localStorage.getItem('labels.lastSize') ?? '{}')).toMatchObject({ preset: 'r60x40' });
  });

  // Label audit, 2026-10-16: a sized item's size, and a use-by for this print only.
  it('sends the size and a typed use-by for this print', async () => {
    api.fetchLabelProducts.mockResolvedValue({ data: [
      { id: 9, name: 'Mango juice', name_dv: null, label_enabled: true, label_shelf_life_days: 3, sizes: [{ id: 91, name: 'Small', price: 15 }, { id: 92, name: 'Large', price: 25 }] },
    ] });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Mango juice/ }));
    const cards = await screen.findByRole('group', { name: 'Which label' });
    fireEvent.click(within(cards).getByRole('button', { name: /Jar or tub/ }));
    fireEvent.click(screen.getByTestId('make-next-2'));
    await waitFor(() => expect(api.stickerLinks).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('make-size'), { target: { value: '92' } });
    fireEvent.change(screen.getByTestId('make-exp'), { target: { value: '2099-01-05' } });
    expect(screen.getByText(/For this print only/)).toBeInTheDocument();
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({
      items: [{ id: 9, copies: 1, kind: 'item', size: 92 }], exp: '2099-01-05', preview: true,
    })), { timeout: 3000 });
  });

  it('offers a size of your own and a label printer, and starts over', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    expect(api.updateItemLabel).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /My own size/ }));
    expect(screen.getByTestId('make-own-size')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('make-own-size')).getByRole('button', { name: 'Round' }));
    fireEvent.click(within(screen.getByTestId('make-own-size')).getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Across (mm)'), { target: { value: '45' } });
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('Round 45 mm · round sticker');
    fireEvent.click(screen.getByTestId('make-next-2'));
    fireEvent.click(screen.getByTestId('make-next-3'));
    fireEvent.click(screen.getByRole('button', { name: 'Label printer' }));
    expect(screen.getByRole('spinbutton', { name: 'Labels' })).toHaveValue(1);
    fireEvent.click(screen.getByTestId('make-pdf'));
    await waitFor(() => expect(api.downloadLabelSheet).toHaveBeenCalledWith('/labels/stickers.pdf?signature=x'));
    expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ layout: 'single-round-custom', w: 45, h: null, items: [{ id: 8, copies: 1, kind: 'item' }] }));
    fireEvent.click(screen.getByTestId('make-again'));
    expect(screen.getByTestId('make-step-1')).toBeInTheDocument();
  });

  // Round 3 (owner, 2026-10-13): tap the name, the dates, the batch on the
  // preview; the sheet holds that part's boxes alone, saves them, and the
  // preview redraws. The print's own values sit at the top of their sheets.
  it('opens a part\'s boxes from a tap on the preview, saves them and redraws', async () => {
    api.fetchCustomLabels.mockResolvedValue({ data: [{ id: 5, name: 'Garlic Sauce', name_dv: null, brand_name: 'Amma', label_type_name: null, label_shelf_life_days: 14, defaults: { heading: 'CHILLED', unit: 'PCS', shelf_life_days: null } }] });
    api.updateCustomLabel.mockImplementation(async (id: number, body: Record<string, unknown>) => ({ data: { id, name: 'Garlic Sauce', name_dv: null, brand_name: 'Amma', label_type_name: null, label_shelf_life_days: 14, ...body } }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Something else/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Garlic Sauce/ }));
    fireEvent.click(within(await screen.findByRole('group', { name: 'Which label' })).getByRole('button', { name: /Jar or tub/ }));
    fireEvent.click(screen.getByTestId('make-next-2'));

    // The zones arrive with the preview, and the line under it says what they are for.
    const nameZone = await screen.findByRole('button', { name: 'Change the name' });
    expect(screen.getByTestId('make-preview-line')).toHaveTextContent('Tap a part of the label to change it.');
    expect(screen.getByTestId('make-details')).toHaveTextContent('All details');
    fireEvent.click(nameZone);
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('Name');
    fireEvent.change(within(sheet).getByLabelText('Product name'), { target: { value: 'Garlic Sauce 2' } });
    const drawn = api.stickerLinks.mock.calls.length;
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.updateCustomLabel).toHaveBeenCalledWith(5, { name: 'Garlic Sauce 2', name_dv: null }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(api.stickerLinks.mock.calls.length).toBeGreaterThan(drawn), { timeout: 3000 });
    expect(screen.getByRole('heading', { name: 'Does it look right?' })).toBeInTheDocument();

    // The dates: this print's made-on date first, then the product's shelf life, which is what gets saved.
    fireEvent.click(screen.getByRole('button', { name: 'Change the dates' }));
    const dates = await screen.findByRole('dialog');
    expect(within(dates).getByLabelText('Fill in the dates')).toBeChecked();
    fireEvent.change(within(dates).getByLabelText('Made on'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ mfg: '2026-10-01', preview: true })), { timeout: 3000 });
    fireEvent.change(within(dates).getByLabelText('Shelf life (days)'), { target: { value: '21' } });
    fireEvent.click(within(dates).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.updateCustomLabel).toHaveBeenLastCalledWith(5, { label_shelf_life_days: 21 }));

    // The batch is typed for this print alone: nothing is saved, the preview carries it.
    fireEvent.click(await screen.findByRole('button', { name: 'Change the batch number' }));
    const batch = await screen.findByRole('dialog');
    fireEvent.change(within(batch).getByLabelText('Batch number'), { target: { value: 'B-42' } });
    fireEvent.click(within(batch).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ batch: 'B-42', preview: true })), { timeout: 3000 });
    expect(api.updateCustomLabel).toHaveBeenCalledTimes(2);
    // All details from a sheet opens the long form.
    fireEvent.click(screen.getByRole('button', { name: 'Change the name' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'All details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // Round 6 (owner, 2026-10-13: only the sizes you own): the rolls registered under
  // Settings come first as cards, the wizard starts on the first, and the picture
  // cards wait under More sizes.
  // Round 7 (2026-10-13): the preview step keeps the label's settings and the size picked as a template.
  it('keeps the picked label\'s settings and size as a template from the preview step, for label managers only', async () => {
    api.createLabelTemplate.mockResolvedValue({ data: { id: 5, name: 'Masroshi template' } });
    render(<MemoryRouter><MakeLabelWizard canManage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    fireEvent.click(within(await screen.findByRole('group', { name: 'Which label' })).getByRole('button', { name: /Jar or tub/ }));
    fireEvent.click(screen.getByTestId('make-next-2'));
    fireEvent.click(await screen.findByTestId('save-as-template'));
    expect(screen.getByLabelText('Template name')).toHaveValue('Masroshi template');
    fireEvent.click(screen.getByTestId('save-template-save'));
    await waitFor(() => expect(api.createLabelTemplate).toHaveBeenCalledTimes(1));
    expect(api.createLabelTemplate.mock.calls[0][0]).toMatchObject({ name: 'Masroshi template', source: 'Masroshi', fields: { label_storage: 'frozen', label_shelf_life_days: 90, label_pack_unit: 'PCS' }, size: { preset: 'r60x40', on: 'sheet', w: 60, h: 40 } });
    expect(api.createLabelTemplate.mock.calls[0][0].fields).not.toHaveProperty('label_ingredients');
  });

  it('offers no Save as template without Manage label settings', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    fireEvent.click(within(await screen.findByRole('group', { name: 'Which label' })).getByRole('button', { name: /Jar or tub/ }));
    fireEvent.click(screen.getByTestId('make-next-2'));
    await screen.findByTestId('make-details');
    expect(screen.queryByTestId('save-as-template')).toBeNull();
  });

  // The drag designer (round 8): with Manage label settings, Move and resize on the preview step saves a drag to the product and redraws.
  it('drags a part on the preview step into the product\'s layout, for label managers', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 120, height: 80, left: 0, top: 0, right: 120, bottom: 80, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    api.updateItemLabel.mockResolvedValue({ data: { id: 8, name: 'Masroshi', name_dv: null, label_enabled: true, label_layout: { small: { name: { dx: 5, dy: 0, s: 1 } } } } });
    render(<MemoryRouter><MakeLabelWizard canManage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    fireEvent.click(within(await screen.findByRole('group', { name: 'Which label' })).getByRole('button', { name: /Jar or tub/ }));
    fireEvent.click(screen.getByTestId('make-next-2'));
    await screen.findByRole('button', { name: 'Change the name' });
    fireEvent.click(screen.getByTestId('arrange-switch'));
    const name = await screen.findByRole('button', { name: 'Move the name' });
    expect(screen.getByTestId('make-preview-line')).toHaveTextContent('Drag a part to move it');
    // 120 px for a 60 mm label: 2 px per mm.
    fireEvent.pointerDown(name, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(name, { pointerId: 1, clientX: 20, clientY: 10 });
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenCalledWith(8, { label_layout: { small: { name: { dx: 5, dy: 0, s: 1 } } } }));
    await waitFor(() => expect(screen.getByTestId('arrange-reset')).toBeEnabled());
    rect.mockRestore();
  });

  it('shows the rolls you own first and keeps the other sizes under More sizes', async () => {
    api.fetchLabelLayouts.mockResolvedValue({
      data: [], presets, limits, wrap: { parts: [], marks: [], default_parts: [], default_marks: [], max_pictures: 4 },
      rolls: [
        { id: 'small', name: 'Small roll', shape: 'rect', preset: 'r60x40', on: 'printer', w: 60, h: 40 },
        { id: 'lids', name: '', shape: 'circle', preset: 'c60', on: 'sheet', w: 60, h: 60 },
      ],
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    const mine = await screen.findByRole('group', { name: 'My label rolls' });
    const cards = within(mine).getAllByRole('button');
    expect(cards.map((c) => c.textContent)).toEqual(['Small roll60 × 40 mm · label printer', 'Round 60 mm12 on A4 sheet']);
    // Started on the first roll: picked, and the picture cards folded away.
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: 'Which label' })).toBeNull();
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('60 × 40 mm · small sticker · one per label on a label printer');
    expect(screen.getByTestId('make-next-2')).toBeEnabled();

    fireEvent.click(cards[1]);
    expect(cards[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('Round 60 mm · round sticker · 12 on A4 sheet');

    fireEvent.click(screen.getByTestId('make-more-sizes'));
    const all = screen.getByRole('group', { name: 'Which label' });
    fireEvent.click(within(all).getByRole('button', { name: /Jar or tub/ }));
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('60 × 40 mm · small sticker · 18 on A4 sheet');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('make-next-2'));
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ layout: 'a4-custom', w: 60, h: 40, roll: null, preview: true })));
  });

  // Label stock (round 13): a counted roll's card says what is left, and a print on it names the roll so it is counted off.
  it('names the roll a print is on, and says what is left on it', async () => {
    api.fetchLabelLayouts.mockResolvedValue({
      data: [], presets, limits, wrap: { parts: [], marks: [], default_parts: [], default_marks: [], max_pictures: 4 },
      rolls: [{ id: 'small', name: 'Small roll', shape: 'rect', preset: 'r60x40', on: 'printer', w: 60, h: 40, left: 34, low: 50, unit: 'labels', low_now: true, out: false }],
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    const mine = await screen.findByRole('group', { name: 'My label rolls' });
    expect(within(mine).getByRole('button', { name: /Small roll/ })).toHaveTextContent('34 labels left');
    fireEvent.click(screen.getByTestId('make-next-2'));
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ layout: 'single-custom', w: 60, h: 40, roll: 'small', preview: true })));
  });

  // The mock-up (round 14): step 3 shows the label flat, or on a jar, bottle or box.
  it('shows the label on a pack at step 3', async () => {
    api.stickerLinks.mockResolvedValue({ url: '/s', one_url: '/labels/stickers?one=1', view_url: '/v', pdf_url: '/p', expires_in_minutes: 30,
      mock_urls: { jar: '/labels/stickers?mock=jar', bottle: '/labels/stickers?mock=bottle' },
      summary: { layout: 'a4-4', label: '4 on A4', design: 'full', stickers: 1, pages: 1, per_page: 4, products: [], spots: [] } });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    fireEvent.click(await screen.findByTestId('make-next-2'));
    const jar = await screen.findByTestId('make-mock-jar');
    expect(screen.getByTestId('make-flat')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(jar);
    expect(jar).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByTestId('make-mockup').querySelector('iframe')?.getAttribute('src') ?? '').toContain('mock=jar'));
    fireEvent.click(screen.getByTestId('make-flat'));
    expect(screen.queryByTestId('make-mockup')).toBeNull();
  });

  // Label audit, Batch B (2026-10-16): the last step shows the use-by that prints and stops a print the lock refuses.
  it('shows the use-by with the short-life mark, what did not fit, and the wording lock on the last step', async () => {
    const message = 'The wording is locked: Bajiya has legal lines not signed off as they stand. Sign them off on the label first, or turn the lock off under Labels → Settings.';
    api.stickerLinks.mockImplementation(async () => ({
      url: '/s', one_url: '/labels/stickers?one=1', view_url: '/v', pdf_url: '/p', expires_in_minutes: 30,
      summary: { layout: 'a4-custom', label: '', design: 'small', w: 60, h: 40, stickers: 1, pages: 1, per_page: 18, spots: [], dropped: ['QR code'],
        products: [{ id: 7, name: 'Bajiya', copies: 1, mfg: '2026-10-04', exp: '2026-10-06', shelf_life_days: 2, ingredients_from: 'manual' }],
        wording: { refused: [{ key: 'i7', kind: 'item', id: 7, name: 'Bajiya' }], message } },
    }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Bajiya/ }));
    const cards = await screen.findByRole('group', { name: 'Which label' });
    fireEvent.click(within(cards).getByRole('button', { name: /Jar or tub/ }));
    fireEvent.click(screen.getByTestId('make-next-2'));
    expect(await screen.findByTestId('sticker-dropped')).toHaveTextContent('Did not fit on this size: QR code.');
    fireEvent.click(screen.getByTestId('make-next-3'));

    expect(screen.getByTestId('make-use-by')).toHaveTextContent(/Use by .*2026 on every label/);
    expect(screen.getByTestId('short-life')).toHaveTextContent('Short life · 2 days');
    expect(screen.getByTestId('wording-lock-notice')).toHaveTextContent(message);
    expect(screen.getByTestId('make-print')).toBeDisabled();
    expect(screen.getByTestId('make-pdf')).toBeDisabled();
    expect(screen.getByTestId('link-life-note')).toBeInTheDocument();
  });
});
