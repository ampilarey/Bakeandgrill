import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LAYOUT_DRAW } from './draw';
import { LAYOUTS, PALETTES, SIZES, blankSpec, captionOf, fullSpec, priceWords } from './types';

const api = vi.hoisted(() => ({
  fetchSocialPosters: vi.fn(),
  createSocialPoster: vi.fn(),
  updateSocialPoster: vi.fn(),
  deleteSocialPoster: vi.fn(),
  uploadSocialPosterPicture: vi.fn(),
  fetchSocialItemPreview: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('qrcode.react', () => ({ QRCodeCanvas: () => null }));
vi.mock('../ItemSearch', () => ({ ItemSearch: () => <div data-testid="item-search" /> }));
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));

import { SocialPosterMaker } from './SocialPosterMaker';

const BRAND = { name: 'Bake & Grill', tagline: 'Fresh Baked, Fire Grilled', phone: '9120011', website: 'bakeandgrill.mv', order_url: 'https://bakeandgrill.mv/order' };

describe('the social post designs', () => {
  it('offers many looks: every layout is drawn, in every colour', () => {
    expect(LAYOUTS.length * PALETTES.length).toBeGreaterThanOrEqual(100);
    for (const l of LAYOUTS) expect(LAYOUT_DRAW[l.key], l.key).toBeTypeOf('function');
    expect(new Set(LAYOUTS.map((l) => l.key)).size).toBe(LAYOUTS.length);
    expect(new Set(PALETTES.map((p) => p.key)).size).toBe(PALETTES.length);
  });

  it('makes the shapes the platforms take', () => {
    expect(SIZES.map((s) => `${s.w}x${s.h}`)).toEqual(['1080x1350', '1080x1080', '1080x1920', '1200x630']);
  });

  it('starts a post with the business\'s own details and fills an old saved one in', () => {
    const fresh = blankSpec(BRAND);
    expect(fresh.phone).toBe('9120011');
    expect(fresh.link).toBe('https://bakeandgrill.mv/order');
    const old = fullSpec({ headline: 'Momo', show: { price: false } as never }, BRAND);
    expect(old.headline).toBe('Momo');
    expect(old.show.price).toBe(false);
    expect(old.show.logo).toBe(true);
    expect(old.cta).toBe('Order now');
  });

  it('writes the price and the caption from the same words', () => {
    expect(priceWords('45')).toBe('45.00');
    expect(priceWords('From 45')).toBe('From 45');
    const spec = { ...blankSpec(BRAND), headline: 'Frozen Momo', price: '45' };
    expect(captionOf(spec)).toBe('Frozen Momo · MVR 45.00\nOrder now: https://bakeandgrill.mv/order · Call 9120011');
  });
});

describe('Make a post', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.fetchSocialPosters.mockResolvedValue({ data: [{ id: 7, name: 'Momo offer', layout: 'arch', palette: 'bee', spec: { headline: 'Frozen Momo', price: '45.00' }, updated_at: null }], brand: BRAND });
    api.createSocialPoster.mockResolvedValue({ data: { id: 9, name: 'Bajiya', layout: 'spotlight', palette: 'chilli', spec: {}, updated_at: null } });
    api.updateSocialPoster.mockResolvedValue({ data: { id: 7, name: 'Momo offer', layout: 'side', palette: 'bee', spec: {}, updated_at: null } });
    // jsdom has no canvas: the screen must still work without one.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  });

  it('changes the design with one tap and keeps the words', async () => {
    render(<SocialPosterMaker canCompose onSend={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Headline'), { target: { value: 'Bajiya' } });
    fireEvent.click(screen.getByTitle('Spotlight'));
    fireEvent.click(screen.getByTitle('Chilli'));
    expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe('Bajiya');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.createSocialPoster).toHaveBeenCalled());
    const sent = api.createSocialPoster.mock.calls[0][0];
    expect(sent).toMatchObject({ name: 'Bajiya', layout: 'spotlight', palette: 'chilli' });
    expect(sent.spec.headline).toBe('Bajiya');
    expect(sent.spec.phone).toBe('9120011');
  });

  it('opens a saved post as it was left and saves changes to the same one', async () => {
    render(<SocialPosterMaker canCompose onSend={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe('Frozen Momo');
    expect(screen.getByTitle('Arch').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTitle('Black and yellow').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTitle('Side band'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateSocialPoster).toHaveBeenCalledWith(7, expect.objectContaining({ layout: 'side', palette: 'bee' })));
  });

  it('shows a part\'s box only while the part is on', async () => {
    render(<SocialPosterMaker canCompose onSend={() => {}} />);
    await screen.findByLabelText('Headline');
    expect(screen.queryByLabelText('Sticker words')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Sticker' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today only' }));
    expect((screen.getByLabelText('Sticker words') as HTMLInputElement).value).toBe('Today only');
  });

  it('leaves saving and posting out for someone who may only look', async () => {
    render(<SocialPosterMaker canCompose={false} onSend={() => {}} />);
    await screen.findByLabelText('Headline');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Post it/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });
});
