import type { ReactNode } from 'react';

export type AccordionItemProps = {
  id: string;
  title: string;
  /** Collapsed summary of the chosen value (e.g. "Pickup · ASAP"). */
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Accessible label for the change/expand control when collapsed. */
  changeLabel?: string;
};

/**
 * Single accordion section. Parent owns which `id` is open (one-at-a-time).
 */
export function AccordionItem({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
  changeLabel = 'Change',
}: AccordionItemProps) {
  const panelId = `${id}-panel`;
  const triggerId = `${id}-trigger`;

  return (
    <div className={`accordion${open ? ' is-open' : ''}`}>
      <button
        type="button"
        id={triggerId}
        className="accordion__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span>
          <span className="accordion__title">{title}</span>
          {!open && summary != null && summary !== '' && (
            <div className="accordion__summary">{summary}</div>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {!open && (
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {changeLabel}
            </span>
          )}
          <span className="accordion__chevron" aria-hidden="true">▾</span>
        </span>
      </button>
      {open && (
        <div id={panelId} role="region" aria-labelledby={triggerId} className="accordion__panel">
          {children}
        </div>
      )}
    </div>
  );
}
