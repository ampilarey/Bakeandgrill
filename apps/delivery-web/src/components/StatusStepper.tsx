import type { DeliveryStatus } from '../types';

const STEPS: { status: DeliveryStatus; label: string; icon: string }[] = [
  { status: 'out_for_delivery', label: 'Assigned',   icon: '📦' },
  { status: 'picked_up',        label: 'Picked Up',  icon: '✅' },
  { status: 'on_the_way',       label: 'On the Way', icon: '🏃' },
  { status: 'delivered',        label: 'Delivered',  icon: '🎉' },
];

const NEXT_ACTION: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string; color: string }>> = {
  out_for_delivery: { next: 'picked_up',  label: 'Mark as Picked Up',  color: 'bg-yellow-500 hover:bg-yellow-600' },
  picked_up:        { next: 'on_the_way', label: 'Start Driving',       color: 'bg-[#D4813A] hover:bg-[#B5681F]' },
  on_the_way:       { next: 'delivered',  label: 'Mark as Delivered',   color: 'bg-green-600 hover:bg-green-700' },
};

interface Props {
  status: DeliveryStatus;
  onUpdate: (next: DeliveryStatus) => void;
  loading?: boolean;
}

export default function StatusStepper({ status, onUpdate, loading }: Props) {
  const currentIndex = STEPS.findIndex(s => s.status === status);
  const nextAction = NEXT_ACTION[status];

  return (
    <div className="space-y-4">
      {/* Step indicators */}
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i <= currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step.status} className="flex-1 flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all ${
                    active ? 'bg-[#D4813A] shadow-md scale-110' :
                    done  ? 'bg-green-500' : 'bg-[#EDE4D4]'
                  }`}
                >
                  {step.icon}
                </div>
                <span className={`text-[10px] mt-1 font-medium text-center leading-tight ${
                  done ? 'text-[#1C1408]' : 'text-[#8B7355]'
                }`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mb-4 mx-1 transition-colors ${i < currentIndex ? 'bg-green-400' : 'bg-[#EDE4D4]'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Action button */}
      {nextAction && (
        <button
          onClick={() => onUpdate(nextAction.next)}
          disabled={loading}
          className={`w-full text-white font-bold py-4 rounded-2xl text-base transition disabled:opacity-60 shadow-md ${nextAction.color}`}
        >
          {loading ? 'Updating…' : nextAction.label}
        </button>
      )}

      {status === 'delivered' && (
        <div className="text-center py-2">
          <span className="text-green-600 font-bold text-base">✅ Delivery Complete!</span>
        </div>
      )}
    </div>
  );
}
