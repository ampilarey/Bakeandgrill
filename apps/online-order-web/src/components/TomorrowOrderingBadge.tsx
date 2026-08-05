type Props = {
  /** Effective tomorrow-ordering gate (null = still loading / unknown). */
  open: boolean | null;
  className?: string;
  style?: React.CSSProperties;
  /** Brief label when open (default from caller / i18n). */
  openLabel: string;
  /** Brief label when closed. */
  closedLabel: string;
};

/**
 * Small status pill for the collect-tomorrow gate — separate from today’s
 * online-ordering badge on the home hero.
 */
export function TomorrowOrderingBadge({
  open,
  openLabel,
  closedLabel,
  className = '',
  style,
}: Props) {
  if (open === null) return null;

  const label = open ? openLabel : closedLabel;

  return (
    <span
      className={`tomorrow-ordering-badge ${open ? 'open' : 'closed'} ${className}`.trim()}
      style={style}
      role="status"
      aria-label={label}
      data-testid="tomorrow-ordering-badge"
    >
      <span className="tomorrow-ordering-badge__dot" />
      {label}
    </span>
  );
}
