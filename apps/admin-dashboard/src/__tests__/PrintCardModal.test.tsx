import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { defaults, cardPdf } = vi.hoisted(() => ({ cardPdf: vi.fn(), defaults: {
  kind: 'gift', template: 'classic', size: 'cr80', w: 85.6, h: 53.98, orientation: 'landscape', accent: 'brown', lang: 'en',
  title: 'Gift card', title_dv: '', headline: '', headline_dv: '', note: '', note_dv: '', photo: '', photo_dim: 45,
  show_logo: true, show_qr: true, show_code: true, show_expiry: true, show_number: false,
  back: true, back_title: 'Terms', back_title_dv: '', back_text: '', back_text_dv: '', back_contact: true,
  stamps: 0, stamp_reward: '', stamp_reward_dv: '',
} }));
cardPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
vi.mock('../api/cards', () => ({
  fetchCards: vi.fn().mockResolvedValue({ designs: [{ id: 7, name: 'Gold gift', settings: { ...defaults, accent: 'gold' }, updated_at: null }], prints: [], defaults: { gift: defaults } }),
  previewCard: vi.fn().mockResolvedValue({ html: '<p>card</p>', page: [85.6, 53.98], cards: 1, a4_per_page: 10 }),
  cardPdf: (...a: unknown[]) => cardPdf(...a),
}));

import { PrintCardModal } from '../components/PrintCardModal';

describe('PrintCardModal', () => {
  it('prints a gift card with the saved design of its kind, as a card-printer PDF of both sides', async () => {
    window.open = vi.fn().mockReturnValue({ location: { href: '' }, close: vi.fn() }) as unknown as typeof window.open;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    render(<MemoryRouter><PrintCardModal data={{ kind: 'gift', source: { type: 'gift_card', code: 'GC-1234' }, label: 'Gift card' }} onClose={() => {}} /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('7'));
    fireEvent.click(await screen.findByRole('button', { name: /Make PDF/ }));
    await waitFor(() => expect(cardPdf).toHaveBeenCalled());
    const body = cardPdf.mock.calls[0][0];
    expect(body.source).toEqual({ type: 'gift_card', code: 'GC-1234', copies: 1 });
    expect(body.output).toBe('card');
    expect(body.sides).toBe('both');
    expect(body.design_id).toBe(7);
    expect(body.settings.accent).toBe('gold');
  });
});
