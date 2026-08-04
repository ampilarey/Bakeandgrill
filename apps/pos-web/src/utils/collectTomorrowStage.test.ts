import { describe, expect, it } from "vitest";
import {
  businessDayStartIso,
  businessTodayYmd,
  isBusinessDateInFuture,
} from "@shared/utils/businessDay";
import { ticketStage, type TicketStage } from "./openTicketUtils";
import {
  compareTicketsByAge,
  ticketAgeAnchor,
  ticketAgeLevel,
  ticketAgeTitle,
} from "./ticketAging";

/** Fixed "evening in Malé" — 2026-08-04 21:00 +05:00 = 16:00 UTC. */
const EVENING = new Date("2026-08-04T16:00:00.000Z");
/** Collection morning — 2026-08-05 08:00 +05:00 = 03:00 UTC. */
const COLLECTION_MORNING = new Date("2026-08-05T03:00:00.000Z");
/** Late evening still 4 Aug in Malé (23:30 +05 = 18:30 UTC — still 4 Aug UTC too). */
const LATE_LOCAL_EVENING = new Date("2026-08-04T18:30:00.000Z");

function hoursAgoIso(hours: number, now: Date): string {
  return new Date(now.getTime() - hours * 3600_000).toISOString();
}

function minutesAgoIso(minutes: number, now: Date): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

describe("business day boundary (Maldives)", () => {
  it("does not treat UTC midnight as the restaurant day flip", () => {
    // 2026-08-04 23:30 Maldives = 18:30 UTC — still 4 Aug locally.
    expect(businessTodayYmd(LATE_LOCAL_EVENING)).toBe("2026-08-04");
    expect(isBusinessDateInFuture("2026-08-05", LATE_LOCAL_EVENING)).toBe(true);
  });
});

describe("ticketStage — tomorrow handover", () => {
  it("marks a future fulfil_date ticket as tomorrow until collection day", () => {
    const ticket = {
      status: "paid",
      fired_at: null,
      fulfil_date: "2026-08-05",
      created_at: hoursAgoIso(18, EVENING),
    };
    expect(ticketStage(ticket, undefined, undefined, EVENING)).toBe("tomorrow");
    expect(ticketStage(ticket, undefined, undefined, COLLECTION_MORNING)).toBe("parked");
  });

  it("keeps ordinary held tickets as parked with no fulfil_date", () => {
    expect(
      ticketStage(
        { status: "held", fired_at: null, fulfil_date: null, created_at: minutesAgoIso(45, EVENING) },
        undefined,
        undefined,
        EVENING,
      ),
    ).toBe("parked");
  });

  it("does not flip tomorrow → parked late in the local evening (UTC trap)", () => {
    const ticket = {
      status: "paid",
      fired_at: null,
      fulfil_date: "2026-08-05",
      created_at: hoursAgoIso(6, LATE_LOCAL_EVENING),
    };
    expect(ticketStage(ticket, undefined, undefined, LATE_LOCAL_EVENING)).toBe("tomorrow");
  });
});

describe("ticketAging — tomorrow vs parked", () => {
  it("keeps an 18-hour-old tomorrow ticket at age level ok", () => {
    const ticket = {
      status: "paid",
      fired_at: null as string | null,
      fulfil_date: "2026-08-05",
      created_at: hoursAgoIso(18, EVENING),
      held_at: null as string | null,
    };
    const stage = ticketStage(ticket, undefined, undefined, EVENING);
    expect(stage).toBe("tomorrow");
    const level = ticketAgeLevel(ticketAgeAnchor(ticket, stage), stage);
    expect(level).toBe("ok");
    expect(level).not.toBe("critical");
  });

  it("ages from start of collection day when the ticket becomes parked", () => {
    const ticket = {
      status: "paid",
      fired_at: null as string | null,
      fulfil_date: "2026-08-05",
      created_at: hoursAgoIso(18, COLLECTION_MORNING),
      held_at: null as string | null,
    };
    const stage = ticketStage(ticket, undefined, undefined, COLLECTION_MORNING);
    expect(stage).toBe("parked");
    expect(ticketAgeAnchor(ticket, stage)).toBe(businessDayStartIso("2026-08-05"));
    // 08:00 on collection day → 8 hours since midnight → critical under 30m rule
    // if we wrongly used created_at; with day-start anchor at 00:00 it is also
    // critical by 08:00 — assert the anchor is day-start, not created_at.
    expect(ticketAgeAnchor(ticket, stage)).not.toBe(ticket.created_at);
  });

  it("leaves the ordinary parked 15/30 rule untouched", () => {
    const created = minutesAgoIso(45, EVENING);
    const ticket = {
      status: "held",
      fired_at: null as string | null,
      fulfil_date: null as string | null,
      created_at: created,
      held_at: created,
    };
    const stage = ticketStage(ticket, undefined, undefined, EVENING);
    expect(stage).toBe("parked");
    expect(ticketAgeAnchor(ticket, stage)).toBe(created);
    expect(ticketAgeLevel(created, "parked", EVENING.getTime())).toBe("critical");
  });

  it("never says fire or void soon for the tomorrow stage", () => {
    const title = ticketAgeTitle("critical", "tomorrow", { fulfil_date: "2026-08-05" });
    expect(title.toLowerCase()).not.toContain("fire or void");
    expect(title).toMatch(/waiting for/i);
    expect(title).toMatch(/nothing to do yet/i);
  });

  it("sorts a stale ordinary parked ticket above a tomorrow ticket", () => {
    const now = EVENING;
    const parked45 = {
      status: "held",
      fired_at: null as string | null,
      fulfil_date: null as string | null,
      created_at: minutesAgoIso(45, now),
      held_at: minutesAgoIso(45, now),
    };
    const tomorrow18h = {
      status: "paid",
      fired_at: null as string | null,
      fulfil_date: "2026-08-05",
      created_at: hoursAgoIso(18, now),
      held_at: null as string | null,
    };
    const stageOf = (t: typeof parked45 | typeof tomorrow18h): TicketStage =>
      ticketStage(t, undefined, undefined, now);
    // Level rank: critical parked (0) before ok tomorrow (2).
    expect(ticketAgeLevel(ticketAgeAnchor(parked45, "parked"), "parked", now.getTime())).toBe(
      "critical",
    );
    expect(ticketAgeLevel(ticketAgeAnchor(tomorrow18h, "tomorrow"), "tomorrow", now.getTime())).toBe(
      "ok",
    );
    expect(compareTicketsByAge(parked45, tomorrow18h, stageOf)).toBeLessThan(0);
  });
});

describe("stageCounts — Parked excludes tomorrow", () => {
  it("counts tomorrow and parked separately", () => {
    const now = EVENING;
    const tickets = [
      { status: "paid", fired_at: null, fulfil_date: "2026-08-05", created_at: hoursAgoIso(18, now) },
      { status: "paid", fired_at: null, fulfil_date: "2026-08-05", created_at: hoursAgoIso(10, now) },
      { status: "held", fired_at: null, fulfil_date: null, created_at: minutesAgoIso(20, now), held_at: minutesAgoIso(20, now) },
      { status: "pending", fired_at: "2026-08-04T10:00:00Z", fulfil_date: null, created_at: minutesAgoIso(5, now) },
    ];
    const counts = { parked: 0, queued: 0, cooking: 0, ready: 0, tomorrow: 0 };
    tickets.forEach((t) => {
      counts[ticketStage(t, undefined, undefined, now)]++;
    });
    expect(counts.tomorrow).toBe(2);
    expect(counts.parked).toBe(1);
    expect(counts.queued).toBe(1);
  });
});
