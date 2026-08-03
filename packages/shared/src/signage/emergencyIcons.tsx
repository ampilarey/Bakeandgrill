import type { ReactNode } from 'react';

/** Named pictograms for emergency slides (no lucide dependency in shared). */
export const EMERGENCY_ICON_NAMES = [
  'fire',
  'alert',
  'closed',
  'wrench',
  'zap',
  'utensils',
  'users',
  'calendar',
  'megaphone',
  'clock',
] as const;

export type EmergencyIconName = (typeof EMERGENCY_ICON_NAMES)[number];

export function defaultEmergencyIconForMode(mode: string): EmergencyIconName {
  switch (mode) {
    case 'fire_alarm':
      return 'fire';
    case 'power_failure':
      return 'zap';
    case 'maintenance':
      return 'wrench';
    case 'kitchen_closed':
      return 'utensils';
    case 'staff_only':
      return 'users';
    case 'private_event':
    case 'holiday':
      return 'calendar';
    case 'reopening_soon':
      return 'clock';
    case 'closed':
      return 'closed';
    default:
      return 'megaphone';
  }
}

export function isEmergencyIconName(value: string): value is EmergencyIconName {
  return (EMERGENCY_ICON_NAMES as readonly string[]).includes(value);
}

/** Simple SVG glyphs — filled for room-scale legibility. */
export function EmergencyIcon({
  name,
  color = 'currentColor',
}: {
  name: string;
  color?: string;
}): ReactNode {
  const icon = isEmergencyIconName(name) ? name : 'megaphone';
  const common = {
    viewBox: '0 0 24 24',
    width: '100%',
    height: '100%',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case 'fire':
      return (
        <svg {...common} data-testid="signage-emergency-icon-fire">
          <path d="M12 3c2 3 1 5 1 7a3 3 0 1 1-6 0c0-2 2-4 3-5 0 2-1 3-1 5a4 4 0 0 0 8 0c0-3-1-5-5-7z" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...common} data-testid="signage-emergency-icon-alert">
          <path d="M12 3 2 20h20L12 3z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'closed':
      return (
        <svg {...common} data-testid="signage-emergency-icon-closed">
          <circle cx="12" cy="12" r="9" />
          <path d="M7 7l10 10" />
        </svg>
      );
    case 'wrench':
      return (
        <svg {...common} data-testid="signage-emergency-icon-wrench">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-2.7-2.7 3-3z" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...common} data-testid="signage-emergency-icon-zap">
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case 'utensils':
      return (
        <svg {...common} data-testid="signage-emergency-icon-utensils">
          <path d="M3 2v7a3 3 0 0 0 3 3v10" />
          <path d="M6 2v7" />
          <path d="M9 2v7" />
          <path d="M16 2v20" />
          <path d="M16 2a4 4 0 0 1 4 4v3h-4" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common} data-testid="signage-emergency-icon-users">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common} data-testid="signage-emergency-icon-calendar">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common} data-testid="signage-emergency-icon-clock">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'megaphone':
    default:
      return (
        <svg {...common} data-testid="signage-emergency-icon-megaphone">
          <path d="M3 11v2a4 4 0 0 0 4 4h1" />
          <path d="M14 6l7-3v18l-7-3V6z" />
          <path d="M14 9H8a3 3 0 0 0 0 6h6" />
        </svg>
      );
  }
}
