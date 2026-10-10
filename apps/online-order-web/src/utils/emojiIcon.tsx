import type { ReactElement } from 'react';
import {
  AlertTriangle, BadgeCheck, Bike, BookOpen, Cake, Calendar, CheckCircle2, ClipboardList, Clock,
  Flame, Gift, Heart, House, Info, KeyRound, Lock, Mail, MapPin, MessageCircle, Moon, Phone,
  Printer, RefreshCw, Search, ShoppingBag, Smartphone, Star, Sun, Sunrise, User, Utensils,
  Wheat, Zap, type LucideIcon,
} from 'lucide-react';

/**
 * Drawn icons in place of emoji (UI audit, 2026-10-10).
 *
 * Emoji look different on every phone and clash with the drawn icons
 * everywhere else. Wording the owner types in the admin may still start with
 * one (trust row, "💬 WhatsApp"); the known ones become the matching lucide
 * icon and any other is left as typed. Keep in step with the website's
 * App\Support\UiIcon::EMOJI.
 */
const EMOJI_ICONS: Record<string, LucideIcon> = {
  '🌅': Sunrise, '🌄': Sunrise,
  '🏠': House, '🏡': House,
  '☪': BadgeCheck, '✔': BadgeCheck, '✅': CheckCircle2,
  '💬': MessageCircle, '🗨': MessageCircle,
  '🔥': Flame, '🌶': Flame,
  '🛵': Bike, '🚚': Bike, '🚴': Bike,
  '📍': MapPin, '🗺': MapPin,
  '📞': Phone, '☎': Phone, '📱': Smartphone,
  '🕐': Clock, '⏱': Clock, '⏰': Clock, '🕒': Clock,
  '⭐': Star, '🌟': Star,
  '🍽': Utensils, '🍴': Utensils,
  '🛒': ShoppingBag, '🛍': ShoppingBag, '🥡': ShoppingBag, '🏪': ShoppingBag,
  '🔐': Lock, '🔒': Lock, '🔑': KeyRound,
  '⚠': AlertTriangle, '💡': Info, 'ℹ': Info,
  '📧': Mail, '✉': Mail,
  '🎁': Gift, '📋': ClipboardList, '🔄': RefreshCw,
  '🔍': Search, '🔎': Search, '🖨': Printer, '📖': BookOpen,
  '🍞': Wheat, '🥐': Wheat, '🥖': Wheat,
  '❤': Heart, '🤍': Heart, '♥': Heart,
  '📅': Calendar, '🗓': Calendar, '👤': User,
  '🌙': Moon, '☀': Sun,
  '⚡': Zap, '🎂': Cake,
};

/** The order types, drawn the same everywhere: a bag, a scooter, a knife and fork. */
export const ORDER_MODE_ICONS: Record<'pickup' | 'delivery' | 'dine_in', LucideIcon> = {
  pickup: ShoppingBag,
  delivery: Bike,
  dine_in: Utensils,
};

/** Heat as drawn flames, one to four, the same as the website's dish page. */
export const SPICE_LEVELS: Record<string, { label: string; flames: number }> = {
  mild: { label: 'Mild', flames: 1 },
  medium: { label: 'Medium', flames: 2 },
  hot: { label: 'Hot', flames: 3 },
  extra_hot: { label: 'Extra Hot', flames: 4 },
};

export function SpiceFlames({ count, size = 12 }: { count: number; size?: number }): ReactElement {
  return (
    <span className="spice-flames" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Flame key={i} size={size} strokeWidth={2.2} />
      ))}
    </span>
  );
}

/** The favourite heart: an outline, filled rust once saved (index.css .heart-icon). */
export function HeartIcon({ on, size = 18 }: { on: boolean; size?: number }): ReactElement {
  return (
    <Heart
      className={on ? 'heart-icon is-on' : 'heart-icon'}
      size={size}
      strokeWidth={2}
      fill={on ? 'currentColor' : 'none'}
      aria-hidden
      data-on={on ? 'true' : 'false'}
    />
  );
}

/** The icon a typed emoji stands for, or null when it is not one we draw. */
export function iconForEmoji(emoji: string | null | undefined): LucideIcon | null {
  const bare = (emoji ?? '').replace(/[︎️]/g, '').trim();
  return EMOJI_ICONS[bare] ?? null;
}

const LEADING_EMOJI = /^(\p{Extended_Pictographic}[︎️]?(?:‍\p{Extended_Pictographic}[︎️]?)*)\s*/u;

/**
 * Split a known leading emoji off wording: "💬 WhatsApp" → { Icon: MessageCircle, text: "WhatsApp" }.
 * Icon is null when the wording has no leading emoji we draw; the text then
 * keeps whatever it started with.
 */
export function splitLeadingEmoji(text: string): { Icon: LucideIcon | null; text: string } {
  const trimmed = text.trim();
  const m = trimmed.match(LEADING_EMOJI);
  if (m) {
    const Icon = iconForEmoji(m[1]);
    if (Icon) return { Icon, text: trimmed.slice(m[0].length) };
  }
  return { Icon: null, text: trimmed };
}

/**
 * The drawn icon for a typed emoji; an emoji we do not draw is shown as
 * typed, and nothing at all falls back to `fallback` when given.
 */
export function EmojiIcon({
  emoji,
  size = 18,
  fallback,
}: {
  emoji: string | null | undefined;
  size?: number;
  fallback?: LucideIcon;
}): ReactElement | null {
  const Icon = iconForEmoji(emoji) ?? (emoji && emoji.trim() !== '' ? null : fallback ?? null);
  if (Icon) return <Icon size={size} strokeWidth={2} aria-hidden focusable={false} />;
  return emoji && emoji.trim() !== '' ? <span aria-hidden>{emoji}</span> : null;
}
