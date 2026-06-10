import { radius, space } from "../../theme";

type Props = {
  mergeTargetId: number;
  onCancel: () => void;
};

export function MergeModeBanner({ mergeTargetId, onCancel }: Props) {
  return (
    <div
      style={{
        padding: space.s + 2,
        marginBottom: space.s,
        borderRadius: radius.m,
        background: "#EFF6FF",
        border: "1px solid #BFDBFE",
        color: "#1E3A8A",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.s,
      }}
    >
      <span style={{ fontWeight: 600 }}>🔀 Pick source for #{mergeTargetId} — you'll confirm before items move</span>
      <button
        onClick={onCancel}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          background: "#fff",
          border: "1px solid #93C5FD",
          color: "#1E40AF",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
