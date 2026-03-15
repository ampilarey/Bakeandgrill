interface Props {
  className?: string;
  height?: number | string;
  width?: number | string;
  rounded?: boolean;
}

export function Skeleton({ className = '', height, width, rounded = false }: Props) {
  return (
    <div
      className={['skeleton', rounded ? 'rounded-full' : '', className].join(' ')}
      style={{ height, width }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-[14px] border border-[#E8E0D8] p-5 space-y-3">
      <Skeleton height={16} width="40%" />
      <Skeleton height={32} width="60%" />
      <Skeleton height={12} width="80%" />
    </div>
  );
}
