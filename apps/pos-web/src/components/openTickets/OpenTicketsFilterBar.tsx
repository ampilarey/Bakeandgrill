import { useEffect, useState } from "react";
import { palette, radius, space } from "../../theme";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { OpenTicketsFilterKey } from "../../hooks/useOpenTickets";
import { FilterGroup } from "./filterPrimitives";

type Props = {
  allCount: number;
  stageCounts: { queued: number; cooking: number; ready: number; parked: number };
  typeCounts: { dine_in: number; takeaway: number; online_pickup: number; delivery: number };
  paymentCounts: { paid: number; unpaid: number };
  activeFilter: OpenTicketsFilterKey;
  setActiveFilter: (k: OpenTicketsFilterKey) => void;
  searchOpen: boolean;
  search: string;
  setSearch: (v: string) => void;
  toggleSearchOpen: () => void;
};

export function OpenTicketsFilterBar({
  allCount,
  stageCounts,
  typeCounts,
  paymentCounts,
  activeFilter,
  setActiveFilter,
  searchOpen,
  search,
  setSearch,
  toggleSearchOpen,
}: Props) {
  const isNarrow = useMediaQuery("(max-width: 840px)");
  const secondaryActive =
    activeFilter.startsWith("type:") || activeFilter.startsWith("payment:");
  const [moreOpen, setMoreOpen] = useState(secondaryActive);

  useEffect(() => {
    if (secondaryActive) setMoreOpen(true);
  }, [secondaryActive]);

  const chipRowStyle = isNarrow
    ? undefined
    : {
        display: "flex" as const,
        alignItems: "center" as const,
        gap: 6,
        flexWrap: "wrap" as const,
      };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
      <div className={isNarrow ? "pos-open-tickets-chip-row" : undefined} style={chipRowStyle}>
        <FilterGroup
          compact
          activeColor={palette.panelInk}
          options={[{ key: "all", label: "All", count: allCount }]}
          selected={activeFilter}
          onSelect={() => setActiveFilter("all")}
        />
        <FilterGroup
          compact
          activeColor={palette.primary}
          options={[
            { key: "stage:queued", label: "New", count: stageCounts.queued },
            { key: "stage:cooking", label: "Cooking", count: stageCounts.cooking },
            { key: "stage:ready", label: "Ready", count: stageCounts.ready },
            { key: "stage:parked", label: "Parked", count: stageCounts.parked },
          ]}
          selected={activeFilter}
          onSelect={(k) => setActiveFilter(k as OpenTicketsFilterKey)}
        />

        {!isNarrow && <div style={{ flex: 1, minWidth: 4 }} />}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          title="Type and payment filters"
          style={{
            padding: "6px 10px",
            minHeight: 36,
            borderRadius: radius.m,
            border: `1px solid ${moreOpen || secondaryActive ? palette.primary : palette.border}`,
            background: moreOpen || secondaryActive ? palette.primaryBg : palette.panel,
            color: moreOpen || secondaryActive ? palette.primaryDark : palette.panelInk,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {moreOpen ? "Less" : "More"}
          {secondaryActive ? " · on" : ""}
        </button>

        <button
          type="button"
          onClick={toggleSearchOpen}
          title="Search by name, phone, table, or order #"
          style={{
            padding: "6px 10px",
            minHeight: 36,
            borderRadius: radius.m,
            border: `1px solid ${searchOpen || search ? palette.panelInk : palette.border}`,
            background: searchOpen || search ? palette.panelInk : palette.panel,
            color: searchOpen || search ? "#fff" : palette.panelInk,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Search
        </button>
      </div>

      {moreOpen && (
        <div className={isNarrow ? "pos-open-tickets-chip-row" : undefined} style={chipRowStyle}>
          <FilterGroup
            compact
            activeColor={palette.info}
            options={[
              { key: "type:dine_in", label: "Dine-in", count: typeCounts.dine_in },
              { key: "type:takeaway", label: "Takeaway", count: typeCounts.takeaway },
              { key: "type:online_pickup", label: "Pickup", count: typeCounts.online_pickup },
              { key: "type:delivery", label: "Delivery", count: typeCounts.delivery },
            ]}
            selected={activeFilter}
            onSelect={(k) => setActiveFilter(k as OpenTicketsFilterKey)}
          />
          <FilterGroup
            compact
            options={[
              {
                key: "payment:paid",
                label: "Paid",
                count: paymentCounts.paid,
                activeColor: palette.successDark,
              },
              {
                key: "payment:unpaid",
                label: "Unpaid",
                count: paymentCounts.unpaid,
                activeColor: palette.dangerDark,
              },
            ]}
            selected={activeFilter}
            onSelect={(k) => setActiveFilter(k as OpenTicketsFilterKey)}
          />
        </div>
      )}

      {searchOpen && (
        <input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isNarrow ? "Name, phone, table, #…" : "Name, phone, table, order # or ticket note…"}
          style={{
            width: "100%",
            padding: "10px 12px",
            minHeight: 44,
            borderRadius: radius.m,
            border: `1px solid ${palette.border}`,
            background: palette.panel,
            color: palette.panelInk,
            fontSize: 16, // 16px avoids iOS zoom-on-focus
            fontWeight: 500,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}
