import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Bike, MessageCircle, ShoppingBag } from 'lucide-react';
import { EmojiIcon, iconForEmoji, ORDER_MODE_ICONS, splitLeadingEmoji } from './emojiIcon';

describe('emoji to drawn icon', () => {
  it('knows the emoji people type, with or without the variation selector', () => {
    expect(iconForEmoji('🛵')).toBe(Bike);
    expect(iconForEmoji('🍽️')).toBe(iconForEmoji('🍽'));
    expect(iconForEmoji('🏪')).toBe(ShoppingBag);
    expect(iconForEmoji('🦄')).toBeNull();
    expect(iconForEmoji('')).toBeNull();
  });

  it('splits a known leading emoji off wording and leaves others alone', () => {
    expect(splitLeadingEmoji('💬 WhatsApp')).toEqual({ Icon: MessageCircle, text: 'WhatsApp' });
    expect(splitLeadingEmoji('🦄 Unicorn')).toEqual({ Icon: null, text: '🦄 Unicorn' });
    expect(splitLeadingEmoji('Plain')).toEqual({ Icon: null, text: 'Plain' });
  });

  it('draws the icon, keeps an unknown emoji as typed, and falls back when empty', () => {
    const drawn = render(<EmojiIcon emoji="⭐" />);
    expect(drawn.container.querySelector('svg')).not.toBeNull();
    expect(drawn.container.textContent).toBe('');

    const unknown = render(<EmojiIcon emoji="🦄" />);
    expect(unknown.container.querySelector('svg')).toBeNull();
    expect(unknown.container.textContent).toBe('🦄');

    const empty = render(<EmojiIcon emoji="" fallback={ORDER_MODE_ICONS.pickup} />);
    expect(empty.container.querySelector('svg')).not.toBeNull();
  });
});
