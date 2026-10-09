import { Switch } from '../SharedUI';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** A labelled on/off switch. Draws SharedUI's Switch so every switch in admin looks alike. */
export function Toggle({ checked, onChange, label, disabled = false, size = 'sm' }: Props) {
  return (
    <label className={['inline-flex items-center gap-2 cursor-pointer', disabled ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
      <Switch checked={checked} onChange={onChange} disabled={disabled} size={size} />
      {label && <span className="text-sm text-[var(--color-text)]">{label}</span>}
    </label>
  );
}
