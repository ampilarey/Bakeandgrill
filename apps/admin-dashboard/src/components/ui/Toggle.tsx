interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, label, disabled = false, size = 'md' }: Props) {
  const trackCls = size === 'sm'
    ? 'w-8 h-4'
    : 'w-10 h-5';
  const thumbCls = size === 'sm'
    ? 'w-3 h-3 top-0.5 left-0.5'
    : 'w-4 h-4 top-0.5 left-0.5';
  const translateCls = size === 'sm'
    ? 'translate-x-4'
    : 'translate-x-5';

  return (
    <label className={['inline-flex items-center gap-2 cursor-pointer', disabled ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
      <div
        className={[
          'relative rounded-full transition-colors duration-200',
          trackCls,
          checked ? 'bg-[#D4813A]' : 'bg-[#E8E0D8]',
        ].join(' ')}
        onClick={() => !disabled && onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !disabled && onChange(!checked); }}}
      >
        <span
          className={[
            'absolute bg-white rounded-full shadow-sm transition-transform duration-200',
            thumbCls,
            checked ? translateCls : 'translate-x-0',
          ].join(' ')}
        />
      </div>
      {label && <span className="text-sm text-[#1C1408]">{label}</span>}
    </label>
  );
}
