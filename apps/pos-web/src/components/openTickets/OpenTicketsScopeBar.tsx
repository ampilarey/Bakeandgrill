import { space } from "../../theme";
import { ScopeChip } from "./filterPrimitives";

type Props = {
  listScope: "all" | "mine" | "online";
  selectListScope: (scope: "all" | "mine" | "online") => void;
};

export function OpenTicketsScopeBar({ listScope, selectListScope }: Props) {
  return (
    <div
      style={{
        marginBottom: space.s,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <ScopeChip active={listScope === "all"} onClick={() => selectListScope("all")}>
        👥 All staff
      </ScopeChip>
      <ScopeChip active={listScope === "mine"} onClick={() => selectListScope("mine")}>
        👤 Mine
      </ScopeChip>
      <ScopeChip active={listScope === "online"} onClick={() => selectListScope("online")}>
        📱 Online
      </ScopeChip>
    </div>
  );
}
