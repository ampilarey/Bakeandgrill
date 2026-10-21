import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Posters review, 2026-10-17: the print file is made on the queue, so Download
 * for print waits for it before downloading (it used to ask at once and get
 * "Not ready yet"), says so when it takes long, and the page offers mounting
 * and a poster photo kept sharper than the menu's.
 *
 * Poster templates (docs/POSTER_THEMES_HANDOFF.md § 5): the picker comes first
 * (categories with counts, style chips, search, a thumbnail grid, No template
 * for the classic flow), the size picks the variant, each photo slot and text
 * slot has its own control, the footer is folded, a hidden line is false, and
 * a saved template or poster opens in the editor as it was.
 */
const api = vi.hoisted(() => ({
  fetchPosterCatalog: vi.fn(), fetchPosterLookups: vi.fn(), fetchPrintShops: vi.fn(), previewPoster: vi.fn(),
  createPoster: vi.fn(), updatePoster: vi.fn(), exportPoster: vi.fn(), fetchPosterExport: vi.fn(), downloadPosterZip: vi.fn(),
  uploadPosterPhoto: vi.fn(), sendPosterToShop: vi.fn(), fetchPosterTheme: vi.fn(), fetchPosterTemplates: vi.fn(), fetchPosters: vi.fn(),
  savePosterTemplate: vi.fn(),
}));
vi.mock('../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api')>()), ...api }));
vi.mock('../../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ can: () => true, user: null, loading: false }) }));
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: () => undefined }));

import { PostersPage } from '../PostersPage';

const purpose = { key: 'plain_notice', label: 'Plain notice', group: 'Inside', layout: 'notice', bind: 'none', landscape: false, external: null, slots: { headline: 'Open' }, used: 0 };

const themes = {
  categories: [
    { key: 'disc', number: '01', name: 'Discounts & Sales', description: 'Percent-off', count: 1 },
    { key: 'combo', number: '02', name: 'Combos & Price Deals', description: 'Set meals', count: 1 },
  ],
  styles: { classic: 'Classic brand colours', colour: 'Colourful', extra: 'Extra colourful', photo: 'With item photo' },
  sizes: { A2: 'large', A3: 'large', A4: 'small', A5: 'small' },
  font_urls: { anton: 'http://localhost/fonts/pdf/Anton-400.ttf', fri9: 'http://localhost/fonts/pdf/Fraunces-900-Italic.ttf' },
  themes: [
    { id: 'BG-001', key: 'bg001-flash-sale-pastries', title: 'Flash Sale Pastries', category: 'disc', style: 'photo', has_photo: true, photo_slots: 1, text_slots: 9, preview_url: 'http://localhost/api/posters/themes/bg001-flash-sale-pastries/preview-large.jpg', preview_small_url: '' },
    { id: 'BG-012', key: 'bg012-value-meals-menu', title: 'Value Meals Menu', category: 'combo', style: 'colour', has_photo: true, photo_slots: 1, text_slots: 3, preview_url: 'http://localhost/api/posters/themes/bg012-value-meals-menu/preview-large.jpg', preview_small_url: '' },
  ],
};

const textSlot = (id: string, role: string, dflt: string, font = 'anton') => ({ id, default: dflt, role_hint: role, font, size_units: 20, colour: '#FFF3DC', align: 'center', max_width_mm: 400 });
const variant = (name: 'large' | 'small') => ({
  variant: name,
  canvas: { width: 428.5, height: 602.5, bleed_units: 4.25, safe_inset_units: 12.25, min_text_units: 8 },
  sizes: {},
  photo_slots: [{ id: 'p1', shape: 'circle', box: [48, 282, 68, 68], rotation_deg: 0, cutout_ok: true, fill_behind: '#F7670B', placeholder_url: `http://localhost/api/posters/themes/bg012-value-meals-menu/placeholder-${name}-p1.png`, min_px_for_150ppi: [401, 401] }],
  text_slots: [textSlot('t1', 'eyebrow', 'Value meals', 'fri9'), textSlot('t2', 'headline', 'MEAL DEALS'), textSlot('t16', 'footer', 'BAKEANDGRILL.MV', 'j8')],
  qr: null,
  urls: { preview: '', backdrop: `http://localhost/api/posters/themes/bg012-value-meals-menu/backdrop-${name}.svg` },
});
const theme = {
  id: 'BG-012', key: 'bg012-value-meals-menu', title: 'Value Meals Menu', category: { key: 'combo', number: '02', name: 'Combos & Price Deals' },
  style: 'colour', style_label: 'Colourful', has_photo: true, size_to_variant: { A2: 'large', A3: 'large', A4: 'small', A5: 'small' },
  variants: { large: variant('large'), small: variant('small') }, fonts: {},
};

function themedSheet(draft: { sizes: string[]; slots: Record<string, unknown> }) {
  const size = draft.sizes[0] ?? 'A4';
  const variantName = size === 'A2' || size === 'A3' ? 'large' : 'small';
  const dims: Record<string, [number, number]> = { A2: [426, 600], A3: [303, 426], A4: [216, 303], A5: [154, 216] };
  const [w, h] = dims[size] ?? dims.A4;
  const t2 = typeof draft.slots.t2 === 'string' ? draft.slots.t2 : 'MEAL DEALS';
  return {
    w, h, hex_bg: '#2A1A0C',
    pieces: [
      { type: 'backdrop', x: 0, y: 0, w, h },
      { type: 'photo', slot: 'p1', x: 20, y: 100, w: 30, h: 30, source: 'placeholder', src: 'http://localhost/api/posters/themes/bg012-value-meals-menu/placeholder-small-p1.png', clip_d: 'M 20 115 L 50 115 L 50 145 L 20 145 Z', rotation: 0, centre: [35, 130], hex_behind: '#F7670B' },
      { type: 'logo', x: 90, y: 20, w: 30, h: 43, badge: { cx: 105, cy: 45, r: 25, hex: '#F7F5F2' } },
      { type: 'text', slot: 't2', role: 'headline', x: 30, y: 80, w: 150, h: 20, text: t2, font: 'anton', pt: 60, baseline: 98, ascent: 18, hex: '#FFF3DC', align: 'center', tracking: 0.5, shadow: { dx: 1, dy: 1, hex: '#D92B1C' } },
      { type: 'text', slot: 't16', role: 'footer', x: 10, y: 280, w: 60, h: 6, text: 'BAKEANDGRILL.MV', font: 'j8', pt: 9, baseline: 286, ascent: 5, hex: '#FFF3DC', align: 'left' },
    ],
    theme: {
      key: 'bg012-value-meals-menu', id: 'BG-012', title: 'Value Meals Menu', variant: variantName, size,
      map: { s: w / 426, dy: 0, bleed_units: 4.25, ox: 3, oy: 3 }, canvas: [428.5, 602.5], safe: [11, 11, w - 22, h - 22], min_pt: 9, keepout: variantName === 'large',
      photo_order: ['p1'], layers: 2, backdrop_url: `http://localhost/api/posters/themes/bg012-value-meals-menu/backdrop-${variantName}.svg`,
      layer_urls: [`http://localhost/api/posters/themes/bg012-value-meals-menu/backdrop-${variantName}-0.svg`, `http://localhost/api/posters/themes/bg012-value-meals-menu/backdrop-${variantName}-1.svg`],
    },
  };
}

describe('PostersPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.fetchPosterCatalog.mockResolvedValue({ purposes: [purpose], layouts: ['notice'], moods: ['dark'], sizes: ['A5', 'A4', 'A3', 'A2'], places: ['Window'], materials: [{ key: 'foam', label: 'Foam board', white: false }], themes });
    api.fetchPosterLookups.mockResolvedValue({ items: [{ id: 7, name: 'Chicken tikka', name_dv: null, price: { price: 85, from: false } }], promotions: [], categories: [], tables: [] });
    api.fetchPrintShops.mockResolvedValue({ shops: [], proof_approval: false });
    api.fetchPosterTheme.mockResolvedValue(theme);
    api.fetchPosterTemplates.mockResolvedValue([]);
    api.fetchPosters.mockResolvedValue({ posters: [], should_be_down: [] });
    api.previewPoster.mockImplementation(async (draft: { theme?: string | null; sizes: string[]; slots: Record<string, unknown> }) => (
      draft.theme
        ? { content: {}, sheet: themedSheet(draft), preflight: [{ id: 'fit', level: 'ok', message: 'Everything fits.' }], imposition: 'One per page' }
        : { content: { photo_source: 'crop' }, sheet: { w: 154, h: 216, hex_bg: '#000', pieces: [] }, preflight: [{ id: 'fit', level: 'ok', message: 'Everything fits.' }], imposition: 'One per page' }
    ));
    api.createPoster.mockResolvedValue({ id: 9 });
    api.updatePoster.mockResolvedValue({ id: 9 });
    api.downloadPosterZip.mockResolvedValue(new Blob(['zip']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  async function toStepThree() {
    render(<MemoryRouter><PostersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('poster-no-template'));
    fireEvent.click(await screen.findByRole('button', { name: /Plain notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check and download' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenCalled());
  }

  async function pickValueMeals() {
    render(<MemoryRouter><PostersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'BG-012 Value Meals Menu' }));
    await waitFor(() => expect(api.fetchPosterTheme).toHaveBeenCalledWith('bg012-value-meals-menu'));
    await screen.findByTestId('poster-themed-editor');
    await waitFor(() => expect(api.previewPoster).toHaveBeenCalled());
  }

  it('waits for a queued file, then downloads it', async () => {
    api.exportPoster.mockResolvedValue({ id: 4, status: 'queued' });
    api.fetchPosterExport.mockResolvedValueOnce({ id: 4, status: 'queued' }).mockResolvedValueOnce({ id: 4, status: 'ready' });
    await toStepThree();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: /Download for print/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    await waitFor(() => expect(api.downloadPosterZip).toHaveBeenCalledWith(4));
    expect(api.fetchPosterExport).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/ZIP downloaded/)).toBeInTheDocument();
  });

  it('says a failed file instead of downloading', async () => {
    api.exportPoster.mockResolvedValue({ id: 5, status: 'failed', error: 'Preflight failed. Fix the red checks and try again.' });
    await toStepThree();
    fireEvent.click(screen.getByRole('button', { name: /Download for print/ }));
    expect(await screen.findByText('Preflight failed. Fix the red checks and try again.')).toBeInTheDocument();
    expect(api.downloadPosterZip).not.toHaveBeenCalled();
  });

  it('sends the mounting with the preview and offers a poster photo', async () => {
    await toStepThree();
    expect(await screen.findByText(/Only the dish's small website photo/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mounting'), { target: { value: 'standoffs' } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ mounting: 'standoffs' })));
    expect(await screen.findAllByTestId('poster-keepout')).toHaveLength(4);

    api.uploadPosterPhoto.mockResolvedValue({ photo_path: 'posters/photos/abc.jpg', width: 4800, height: 3200 });
    const file = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/Poster photo/), { target: { files: [file] } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ photo_path: 'posters/photos/abc.jpg' }) })));
  });

  it('lists the templates by category with style chips and search, and the classic purposes stay behind No template', async () => {
    render(<MemoryRouter><PostersPage /></MemoryRouter>);
    expect(await screen.findByRole('tab', { name: 'Discounts & Sales · 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All · 2' })).toBeInTheDocument();
    expect(screen.getAllByTestId('poster-theme-card')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Plain notice/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Combos & Price Deals · 1' }));
    expect(screen.getAllByTestId('poster-theme-card')).toHaveLength(1);
    expect(screen.getByText('Value Meals Menu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'With item photo · 1' }));
    expect(screen.getByText(/No template matches/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All styles' }));

    fireEvent.change(screen.getByLabelText('Search templates'), { target: { value: 'flash' } });
    expect(screen.getAllByTestId('poster-theme-card')).toHaveLength(1);
    expect(screen.getByText('Flash Sale Pastries')).toBeInTheDocument();
    expect(screen.getByText(/Searching every category/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('poster-no-template'));
    expect(screen.getByRole('button', { name: /Plain notice/ })).toBeInTheDocument();
  });

  it('picking a template opens its photo and text slots, previews it and switches the variant with the size', async () => {
    await pickValueMeals();
    expect(screen.getByTestId('poster-editor-title')).toHaveTextContent('BG-012 Value Meals Menu');
    expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'bg012-value-meals-menu', template_key: 'themed', layout: 'themed', sizes: ['A4'] }));
    expect(screen.queryByRole('button', { name: 'Landscape' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'dark' })).not.toBeInTheDocument();

    expect(screen.getByTestId('poster-photo-p1')).toHaveTextContent('Photo 1');
    expect(screen.getByLabelText('Headline')).toHaveAttribute('placeholder', 'MEAL DEALS');
    expect(screen.getByLabelText('Small line above')).toHaveAttribute('placeholder', 'Value meals');
    expect(screen.getByTestId('poster-footer-fold')).not.toHaveAttribute('open');
    expect(screen.getByLabelText('Footer')).toBeInTheDocument();

    expect(await screen.findByTestId('poster-themed-preview')).toBeInTheDocument();
    expect(screen.getByTestId('poster-preview-text-t2')).toHaveTextContent('MEAL DEALS');
    expect(screen.getByTestId('poster-variant-note')).toHaveTextContent('Preview: A4, a counter card');

    fireEvent.click(screen.getByRole('button', { name: 'A5' }));
    fireEvent.click(screen.getByRole('button', { name: 'A4' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ sizes: ['A5'] })));
    expect(screen.getByTestId('poster-variant-note')).toHaveTextContent('Preview: A5, a table card');

    fireEvent.click(screen.getByRole('button', { name: 'A2' }));
    fireEvent.click(screen.getByRole('button', { name: 'A5' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ sizes: ['A2'] })));
    expect(screen.getByTestId('poster-variant-note')).toHaveTextContent('wall design');
    await waitFor(() => expect(screen.getByText(/A2 \(wall design\)/)).toBeInTheDocument());
  });

  it('typed words, a hidden line, a dish and an upload reach the preview as slot values', async () => {
    await pickValueMeals();
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'TIKKA DEALS' } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ t2: 'TIKKA DEALS' }) })));
    await waitFor(() => expect(screen.getByTestId('poster-preview-text-t2')).toHaveTextContent('TIKKA DEALS'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset Headline' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ t2: null }) })));

    fireEvent.click(screen.getByRole('button', { name: 'Hide Footer' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ t16: false }) })));
    expect(screen.getByLabelText('Footer')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show Footer' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ t16: null }) })));

    fireEvent.change(screen.getByLabelText('Dish for photo 1'), { target: { value: '7' } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ p1: { item_id: 7, use: 'main' } }) })));
    fireEvent.click(screen.getByRole('button', { name: 'Cut-out' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ p1: { item_id: 7, use: 'cutout' } }) })));

    api.uploadPosterPhoto.mockResolvedValue({ photo_path: 'posters/photos/abcdefabcdefabcdefabcdef.jpg', width: 3000, height: 2000 });
    fireEvent.change(screen.getByLabelText('Upload a photo for photo 1'), { target: { files: [new File(['x'], 'dish.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ slots: expect.objectContaining({ p1: { photo_path: 'posters/photos/abcdefabcdefabcdefabcdef.jpg' } }) })));

    fireEvent.change(screen.getByLabelText('Dish (its photo and live price)'), { target: { value: '7' } });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ bindings: expect.objectContaining({ item_id: 7 }) })));
  });

  it('a counter-size template offers no stand-offs, and Save as template keeps the theme', async () => {
    await pickValueMeals();
    fireEvent.click(screen.getByRole('button', { name: 'Check and download' }));
    await waitFor(() => expect(screen.getByLabelText('Mounting')).toBeInTheDocument());
    const options = within(screen.getByLabelText('Mounting')).getAllByRole('option').map((o) => o.textContent);
    expect(options.join(' ')).not.toMatch(/Stand-offs|Eyelets/);
    expect(screen.getByText(/no stand-off corners/)).toBeInTheDocument();

    api.savePosterTemplate.mockResolvedValue({ id: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    await waitFor(() => expect(api.savePosterTemplate).toHaveBeenCalledWith(expect.objectContaining({ theme: 'bg012-value-meals-menu', template_key: 'themed' })));
    expect(api.createPoster).toHaveBeenCalledWith(expect.objectContaining({ theme: 'bg012-value-meals-menu' }));
  });

  it('a saved template and a saved poster open in the editor as they were', async () => {
    api.fetchPosterTemplates.mockResolvedValue([{ id: 3, name: 'Our meal deals', template_key: 'themed', layout: 'themed', theme: 'bg012-value-meals-menu', mood: 'dark', language: 'en', slots: { t2: 'TIKKA DEALS' }, locked: false }]);
    api.fetchPosters.mockResolvedValue({ posters: [{ id: 12, code: 'P0012', name: 'Window deals', template_key: 'themed', layout: 'themed', theme: 'bg012-value-meals-menu', mood: 'dark', language: 'en', landscape: false, sizes: ['A3'], slots: { t2: 'WINDOW DEALS' }, bindings: {}, state: 'draft', version: 1, should_be_down: false }], should_be_down: [] });
    render(<MemoryRouter><PostersPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Templates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use Our meal deals' }));
    await screen.findByTestId('poster-themed-editor');
    expect(screen.getByLabelText('Headline')).toHaveValue('TIKKA DEALS');
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'bg012-value-meals-menu', slots: { t2: 'TIKKA DEALS' } })));

    fireEvent.click(screen.getByRole('button', { name: 'My posters' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Window deals' }));
    await screen.findByTestId('poster-themed-editor');
    expect(screen.getByLabelText('Headline')).toHaveValue('WINDOW DEALS');
    expect(screen.getByTestId('poster-editor-title')).toHaveTextContent('editing P0012');
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ sizes: ['A3'] })));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updatePoster).toHaveBeenCalledWith(12, expect.objectContaining({ slots: { t2: 'WINDOW DEALS' } })));
  });
});
