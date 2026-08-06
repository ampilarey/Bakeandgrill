import { updateFeatureGate, type FeatureGateStatus } from '../../api';
import { ModeGateCard } from './ModeGateCard';

export function FeatureGateCard({
  gate,
  onChanged,
  onToast,
}: {
  gate: FeatureGateStatus;
  onChanged: (g: FeatureGateStatus) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  return (
    <ModeGateCard
      testId={`feature-gate-${gate.key}`}
      label={gate.label}
      description={gate.description}
      enabled={gate.enabled}
      open={gate.open}
      schedule={gate.schedule}
      overrideUntil={gate.override_until}
      onToast={onToast}
      onToggle={async (next) => {
        const { gate: fresh } = await updateFeatureGate(gate.key, { enabled: next });
        onChanged(fresh);
      }}
      onSaveSchedule={async (schedule) => {
        const { gate: fresh } = await updateFeatureGate(gate.key, { schedule });
        onChanged(fresh);
      }}
      onSetOverride={async (iso) => {
        const { gate: fresh } = await updateFeatureGate(gate.key, { override_until: iso });
        onChanged(fresh);
      }}
    />
  );
}
