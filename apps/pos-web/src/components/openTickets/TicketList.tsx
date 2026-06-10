import { space } from "../../theme";
import type { OpenTicket } from "../../utils/openTicketUtils";
import { TicketRow, type TicketRowProps } from "./TicketRow";

type Props = Omit<TicketRowProps, "ticket" | "busy" | "msg"> & {
  filteredTickets: OpenTicket[];
  busyId: number | null;
  rowMsg: { id: number; text: string; kind: "ok" | "err" } | null;
};

export function TicketList({
  filteredTickets,
  busyId,
  rowMsg,
  ...rowProps
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
      {filteredTickets.map((t) => (
        <TicketRow
          key={t.id}
          ticket={t}
          busy={busyId === t.id}
          msg={rowMsg?.id === t.id ? rowMsg : null}
          {...rowProps}
        />
      ))}
    </div>
  );
}
