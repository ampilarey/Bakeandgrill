import type { Stats } from '../types';

interface Props { stats: Stats }

export default function EarningsCard({ stats }: Props) {
  return (
    <div className="bg-[#1C1408] rounded-2xl p-4 text-white">
      <p className="text-[#8B7355] text-xs font-medium uppercase tracking-wide mb-4">Your Stats</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Today',   value: stats.today },
          { label: 'Week',    value: stats.this_week },
          { label: 'Month',   value: stats.this_month },
        ].map(item => (
          <div key={item.label} className="text-center">
            <p className="text-2xl font-bold text-[#D4813A]">{item.value}</p>
            <p className="text-[#8B7355] text-xs mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-[#3D2910] pt-3 flex justify-between items-center">
        <div>
          <p className="text-[#8B7355] text-xs">Total Earned</p>
          <p className="text-lg font-bold text-[#D4813A]">MVR {stats.total_fees_mvr.toFixed(2)}</p>
        </div>
        {stats.avg_minutes && (
          <div className="text-right">
            <p className="text-[#8B7355] text-xs">Avg. Time</p>
            <p className="text-lg font-bold">{stats.avg_minutes}m</p>
          </div>
        )}
      </div>
    </div>
  );
}
