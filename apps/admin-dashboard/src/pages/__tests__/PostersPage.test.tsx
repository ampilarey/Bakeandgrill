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
 *
 * TV designs (2026-10-22): the picker's Print | TV screens switch, a TV design
 * on screens (Full HD, 4K, portrait) instead of paper, a step 3 with nothing
 * to print (Send to TV, Download pictures), and a saved template keeping its
 * sizes and what it was bound to.
 */
const api = vi.hoisted(() => ({
  fetchPosterCatalog: vi.fn(), fetchPosterLookups: vi.fn(), fetchPrintShops: vi.fn(), previewPoster: vi.fn(),
  createPoster: vi.fn(), updatePoster: vi.fn(), exportPoster: vi.fn(), fetchPosterExport: vi.fn(), downloadPosterZip: vi.fn(),
  uploadPosterPhoto: vi.fn(), sendPosterToShop: vi.fn(), fetchPosterTheme: vi.fn(), fetchPosterTemplates: vi.fn(), fetchPosters: vi.fn(),
  savePosterTemplate: vi.fn(), sendPosterToTv: vi.fn(),
}));
vi.mock('../../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api')>()), ...api }));
vi.mock('../../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ can: () => true, user: null, loading: false }) }));
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: () => undefined }));

import { PostersPage } from '../PostersPage';

const purpose = { key: 'plain_notice', label: 'Plain notice', group: 'Inside', layout: 'notice', bind: 'none', landscape: false, external: null, slots: { headline: 'Open' }, used: 0 };

const TV_KEY = 'tv007-donuts-buy1get1';
const SCREENS = [
  { key: 'TV', label: 'TV · Full HD (1920 × 1080)', px: [1920, 1080], landscape: true },
  { key: 'TV4K', label: 'TV · 4K (3840 × 2160)', px: [3840, 2160], landscape: true },
  { key: 'TVP', label: 'TV · portrait (1080 × 1920)', px: [1080, 1920], landscape: false },
];

const themes = {
  categories: [
    { key: 'disc', number: '01', name: 'Discounts & Sales', description: 'Percent-off', count: 1, counts: { print: 1, screen: 0 } },
    { key: 'combo', number: '02', name: 'Combos & Price Deals', description: 'Set meals', count: 1, counts: { print: 1, screen: 0 } },
    { key: 'bogo', number: '03', name: 'Buy 1 Get 1 & Freebies', description: 'Two for one', count: 1, counts: { print: 0, screen: 1 } },
  ],
  styles: { classic: 'Classic brand colours', colour: 'Colourful', extra: 'Extra colourful', photo: 'With item photo' },
  kinds: { print: 'Print', screen: 'TV screens' },
  sizes: { A2: 'large', A3: 'large', A4: 'small', A5: 'small', TV: 'tv', TV4K: 'tv', TVP: 'tvp' },
  font_urls: { anton: 'http://localhost/fonts/pdf/Anton-400.ttf', fri9: 'http://localhost/fonts/pdf/Fraunces-900-Italic.ttf' },
  themes: [
    { id: 'BG-001', key: 'bg001-flash-sale-pastries', title: 'Flash Sale Pastries', kind: 'print', category: 'disc', style: 'photo', has_photo: true, photo_slots: 1, text_slots: 9, preview_url: 'http://localhost/api/posters/themes/bg001-flash-sale-pastries/preview-large.jpg', preview_small_url: '', aspect: [420, 594] },
    { id: 'BG-012', key: 'bg012-value-meals-menu', title: 'Value Meals Menu', kind: 'print', category: 'combo', style: 'colour', has_photo: true, photo_slots: 1, text_slots: 3, preview_url: 'http://localhost/api/posters/themes/bg012-value-meals-menu/preview-large.jpg', preview_small_url: '', aspect: [420, 594] },
    { id: 'TV-007', key: TV_KEY, title: 'Donuts Buy 1 Get 1', kind: 'screen', category: 'bogo', style: 'photo', has_photo: true, photo_slots: 1, text_slots: 8, preview_url: `http://localhost/api/posters/themes/${TV_KEY}/preview-tv.jpg`, preview_small_url: '', aspect: [1920, 1080] },
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
  id: 'BG-012', key: 'bg012-value-meals-menu', title: 'Value Meals Menu', kind: 'print', category: { key: 'combo', number: '02', name: 'Combos & Price Deals' },
  style: 'colour', style_label: 'Colourful', has_photo: true, size_to_variant: { A2: 'large', A3: 'large', A4: 'small', A5: 'small' },
  variants: { large: variant('large'), small: variant('small') }, fonts: {},
};

/** A TV design: the landscape variant for Full HD and 4K, the portrait one for a screen on its side, in pixels. */
const tvVariant = (name: 'tv' | 'tvp') => ({
  variant: name,
  canvas: { width: name === 'tv' ? 1920 : 1080, height: name === 'tv' ? 1080 : 1920, bleed_units: 0, safe_inset_units: 60, min_text_units: 24 },
  sizes: {},
  photo_slots: [{ id: 'p1', shape: 'circle', box: [1150, 190, 660, 660], rotation_deg: 0, cutout_ok: true, fill_behind: '#F7670B', placeholder_url: `http://localhost/api/posters/themes/${TV_KEY}/placeholder-${name}-p1.png`, min_px_for_150ppi: [660, 660] }],
  text_slots: [textSlot('t1', 'eyebrow', 'This week only', 'fri9'), textSlot('t2', 'headline', 'BUY 1 GET 1'), textSlot('t6', 'footer', 'BAKEANDGRILL.MV', 'j8')],
  qr: null,
  urls: { preview: '', backdrop: `http://localhost/api/posters/themes/${TV_KEY}/backdrop-${name}.svg` },
});
const tvTheme = {
  id: 'TV-007', key: TV_KEY, title: 'Donuts Buy 1 Get 1', kind: 'screen', category: { key: 'bogo', number: '03', name: 'Buy 1 Get 1 & Freebies' },
  style: 'photo', style_label: 'With item photo', has_photo: true, size_to_variant: { TV: 'tv', TV4K: 'tv', TVP: 'tvp' },
  variants: { tv: tvVariant('tv'), tvp: tvVariant('tvp') }, fonts: {},
};

function themedSheet(draft: { theme?: string | null; sizes: string[]; slots: Record<string, unknown> }) {
  const screen = draft.theme === TV_KEY;
  const size = draft.sizes[0] ?? (screen ? 'TV' : 'A4');
  const variantName = screen ? (size === 'TVP' ? 'tvp' : 'tv') : (size === 'A2' || size === 'A3' ? 'large' : 'small');
  const dims: Record<string, [number, number]> = { A2: [426, 600], A3: [303, 426], A4: [216, 303], A5: [154, 216], TV: [1920, 1080], TV4K: [3840, 2160], TVP: [1080, 1920] };
  const [w, h] = dims[size] ?? dims.A4;
  const key = screen ? TV_KEY : 'bg012-value-meals-menu';
  const t2 = typeof draft.slots.t2 === 'string' ? draft.slots.t2 : (screen ? 'BUY 1 GET 1' : 'MEAL DEALS');
  const px = SCREENS.find((s) => s.key === size)?.px ?? null;
  return {
    w, h, hex_bg: '#2A1A0C',
    pieces: [
      { type: 'backdrop', x: 0, y: 0, w, h },
      { type: 'photo', slot: 'p1', x: 20, y: 100, w: 30, h: 30, source: 'placeholder', src: `http://localhost/api/posters/themes/${key}/placeholder-${variantName}-p1.png`, clip_d: 'M 20 115 L 50 115 L 50 145 L 20 145 Z', rotation: 0, centre: [35, 130], hex_behind: '#F7670B' },
      { type: 'logo', x: 90, y: 20, w: 30, h: 43, badge: { cx: 105, cy: 45, r: 25, hex: '#F7F5F2' } },
      { type: 'text', slot: 't2', role: 'headline', x: 30, y: 80, w: 150, h: 20, text: t2, font: 'anton', pt: 60, baseline: 98, ascent: 18, hex: '#FFF3DC', align: 'center', tracking: 0.5, shadow: { dx: 1, dy: 1, hex: '#D92B1C' } },
      { type: 'text', slot: screen ? 't6' : 't16', role: 'footer', x: 10, y: 280, w: 60, h: 6, text: 'BAKEANDGRILL.MV', font: 'j8', pt: 9, baseline: 286, ascent: 5, hex: '#FFF3DC', align: 'left' },
    ],
    theme: {
      key, id: screen ? 'TV-007' : 'BG-012', title: screen ? 'Donuts Buy 1 Get 1' : 'Value Meals Menu', kind: screen ? 'screen' : 'print', variant: variantName, size,
      size_label: screen ? SCREENS.find((s) => s.key === size)?.label : size, px,
      map: screen ? { s: size === 'TV4K' ? 2 : 1, dy: 0, bleed_units: 0, ox: 0, oy: 0 } : { s: w / 426, dy: 0, bleed_units: 4.25, ox: 3, oy: 3 },
      canvas: screen ? [variantName === 'tvp' ? 1080 : 1920, variantName === 'tvp' ? 1920 : 1080] : [428.5, 602.5],
      safe: screen ? [60, 60, w - 120, h - 120] : [11, 11, w - 22, h - 22], min_pt: 9, keepout: variantName === 'large',
      photo_order: ['p1'], layers: 2, backdrop_url: `http://localhost/api/posters/themes/${key}/backdrop-${variantName}.svg`,
      layer_urls: [`http://localhost/api/posters/themes/${key}/backdrop-${variantName}-0.svg`, `http://localhost/api/posters/themes/${key}/backdrop-${variantName}-1.svg`],
    },
  };
}

describe('PostersPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.fetchPosterCatalog.mockResolvedValue({ purposes: [purpose], layouts: ['notice'], moods: ['dark'], sizes: ['A5', 'A4', 'A3', 'A2'], screen_sizes: SCREENS, places: ['Window'], materials: [{ key: 'foam', label: 'Foam board', white: false }], themes });
    api.fetchPosterLookups.mockResolvedValue({ items: [{ id: 7, name: 'Chicken tikka', name_dv: null, price: { price: 85, from: false } }], promotions: [], categories: [], tables: [] });
    api.fetchPrintShops.mockResolvedValue({ shops: [], proof_approval: false });
    api.fetchPosterTheme.mockImplementation(async (key: string) => (key === TV_KEY ? tvTheme : theme));
    api.fetchPosterTemplates.mockResolvedValue([]);
    api.fetchPosters.mockResolvedValue({ posters: [], should_be_down: [] });
    api.sendPosterToTv.mockResolvedValue({ slide_id: 's1', image_url: 'http://localhost/storage/posters/tv.png', date_end: null });
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
    await waitFor(() => expect(api.savePosterTemplate).toHaveBeenCalledWith(expect.objectContaining({ theme: 'bg012-value-meals-menu', template_key: 'themed', sizes: ['A4'], bindings: {} })));
    expect(api.createPoster).toHaveBeenCalledWith(expect.objectContaining({ theme: 'bg012-value-meals-menu' }));
  });

  it('a TV design is picked under TV screens, drawn for a screen, sent to the TV or downloaded as pictures', async () => {
    render(<MemoryRouter><PostersPage /></MemoryRouter>);
    // Print is the first list; the TV switch shows the TV designs with their own category counts.
    expect(await screen.findByRole('tab', { name: 'All · 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'TV-007 Donuts Buy 1 Get 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('poster-kind-screen'));
    expect(screen.getByRole('tab', { name: 'All · 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Buy 1 Get 1 & Freebies · 1' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Discounts & Sales/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('poster-theme-grid')).toHaveClass('poster-theme-grid--screen');
    const card = screen.getByRole('button', { name: 'TV-007 Donuts Buy 1 Get 1' });
    expect(card).toHaveClass('poster-theme-card--screen');
    expect(card.style.getPropertyValue('--aspect')).toBe('1920 / 1080');

    // Screens, not paper: it starts on Full HD, and 4K joins it.
    fireEvent.click(card);
    await screen.findByTestId('poster-themed-editor');
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ theme: TV_KEY, sizes: ['TV'] })));
    expect(screen.getByRole('heading', { name: 'Screen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A4' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full HD · 1920 × 1080' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Portrait · 1080 × 1920' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('poster-variant-note')).toHaveTextContent('Preview: Full HD, a TV screen of 1920 × 1080 px (landscape TV design');
    expect(screen.getByLabelText('Headline')).toHaveAttribute('placeholder', 'BUY 1 GET 1');
    expect(await screen.findByTestId('poster-themed-preview')).toBeInTheDocument();
    expect(screen.getByTestId('poster-preview-caption')).toHaveTextContent('TV · Full HD (1920 × 1080) (TV design)');
    fireEvent.click(screen.getByRole('button', { name: '4K · 3840 × 2160' }));
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ sizes: ['TV', 'TV4K'] })));

    // Step 3 has nothing to print: no material or mounting, Send to TV and Download pictures instead.
    fireEvent.click(screen.getByRole('button', { name: 'Check and send to TV' }));
    expect(await screen.findByTestId('poster-screen-note')).toBeInTheDocument();
    expect(screen.queryByLabelText('Material')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mounting')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send to print shop/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('poster-keepout')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send to TV/ }));
    await waitFor(() => expect(api.sendPosterToTv).toHaveBeenCalledWith(9));
    expect(api.createPoster).toHaveBeenCalledWith(expect.objectContaining({ theme: TV_KEY, sizes: ['TV', 'TV4K'] }));
    expect(await screen.findByText(/On the TV/)).toBeInTheDocument();

    api.exportPoster.mockResolvedValue({ id: 6, status: 'ready' });
    fireEvent.click(screen.getByRole('button', { name: /Download pictures/ }));
    await waitFor(() => expect(api.exportPoster).toHaveBeenCalledWith(9, { sizes: ['TV', 'TV4K'], imposition: 'single', mounting: 'none' }));
    expect(await screen.findByText(/ZIP downloaded: one PNG per screen/)).toBeInTheDocument();

    api.savePosterTemplate.mockResolvedValue({ id: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    await waitFor(() => expect(api.savePosterTemplate).toHaveBeenCalledWith(expect.objectContaining({ theme: TV_KEY, sizes: ['TV', 'TV4K'] })));
  });

  it('a saved template brings back its sizes and bindings, and an old TV template lands on a screen', async () => {
    api.fetchPosterTemplates.mockResolvedValue([
      { id: 3, name: 'Tikka on A3', template_key: 'themed', layout: 'themed', theme: 'bg012-value-meals-menu', mood: 'dark', language: 'en', slots: { t2: 'TIKKA DEALS' }, sizes: ['A3'], bindings: { item_id: 7 }, locked: false },
      { id: 5, name: 'Donuts on the TV', template_key: 'themed', layout: 'themed', theme: TV_KEY, mood: 'dark', language: 'en', slots: {}, sizes: null, bindings: null, locked: true },
    ]);
    render(<MemoryRouter><PostersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Templates' }));
    expect(await screen.findByText(/template bg012-value-meals-menu · A3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use Tikka on A3' }));
    await screen.findByTestId('poster-themed-editor');
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ sizes: ['A3'], bindings: { item_id: 7 }, slots: { t2: 'TIKKA DEALS' } })));
    expect(screen.getByRole('button', { name: 'A3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Dish (its photo and live price)')).toHaveValue('7');

    // Saved before templates kept sizes: a TV design cannot show on A4, so it opens on Full HD.
    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use Donuts on the TV' }));
    await screen.findByRole('heading', { name: 'Screen' });
    await waitFor(() => expect(api.previewPoster).toHaveBeenLastCalledWith(expect.objectContaining({ theme: TV_KEY, sizes: ['TV'] })));
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
