import { palette, radius, space } from "../../theme";
import type { OpenTicketsFilterKey } from "../../hooks/useOpenTickets";
import { FilterDivider, FilterGroup } from "./filterPrimitives";

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
  return (
    <div
      style={{
        marginBottom: space.m,
        padding: space.s,
        background: "#F8FAFC",
        borderRadius: radius.m,
        border: `1px solid ${palette.border}`,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <FilterGroup
        activeColor="#0F172A"
        options={[{ key: "all", label: "All", count: allCount }]}
        selected={activeFilter}
        onSelect={() => setActiveFilter("all")}
      />

      <FilterDivider />

      <FilterGroup
        activeColor="#0F172A"
        options={[
          { key: "stage:queued", label: "⏳ New", count: stageCounts.queued },
          { key: "stage:cooking", label: "🍳 Cooking", count: stageCounts.cooking },
          { key: "stage:ready", label: "✅ Ready", count: stageCounts.ready },
          { key: "stage:parked", label: "📋 Parked", count: stageCounts.parked },
        ]}
        selected={activeFilter}
        onSelect={(k) => setActiveFilter(k as OpenTicketsFilterKey)}
      />

      <FilterDivider />

      <FilterGroup
        activeColor="#1D4ED8"
        options={[
          { key: "type:dine_in", label: "🍽 Dine-in", count: typeCounts.dine_in },
          { key: "type:takeaway", label: "🥡 Takeaway", count: typeCounts.takeaway },
          { key: "type:online_pickup", label: "📦 Online Pickup", count: typeCounts.online_pickup },
          { key: "type:delivery", label: "🚗 Delivery", count: typeCounts.delivery },
        ]}
        selected={activeFilter}
        onSelect={(k) => setActiveFilter(k as OpenTicketsFilterKey)}
      />

      <FilterDivider />

      <FilterGroup
        options={[
          { key: "payment:paid", label: "💳 Paid", count: paymentCounts.paid, activeColor: "#15803D" },
          { key: "payment:unpaid", label: "UNPAID", count: paymentCounts.unpaid, activeColor: "#B91C1C" },
        ]}
        selected={activeFilter}
        onSelect={(k) => setActiveFilter(k as OpenTicketsFilterKey)}
      />

      <div style={{ flex: 1, minWidth: 8 }} />

      <button
        onClick={toggleSearchOpen}
        title="Search by name, phone, table, or order #"
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: `1px solid ${searchOpen || search ? "#0F172A" : palette.border}`,
          background: searchOpen || search ? "#0F172A" : "#fff",
          color: searchOpen || search ? "#fff" : palette.panelInk,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        🔍 Search
      </button>

      {searchOpen && (
        <div style={{ flexBasis: "100%", marginTop: 6 }}>
          <input
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, table, order # or ticket note…"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: radius.m,
              border: `1px solid ${palette.border}`,
              background: "#fff",
              color: palette.panelInk,
              fontSize: 13,
              fontWeight: 500,
              outline: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
