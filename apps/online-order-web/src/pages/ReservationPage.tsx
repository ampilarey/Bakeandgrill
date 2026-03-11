import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Reservation, ReservationSlot } from "@shared/types";
import { ENDPOINTS } from "@shared/api";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function getSlots(date: string, partySize: number): Promise<ReservationSlot[]> {
  const res = await fetch(
    `${API_BASE}${ENDPOINTS.RESERVATIONS_AVAILABILITY}?date=${date}&party_size=${partySize}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Could not load availability.");
  const data = await res.json();
  return data.slots as ReservationSlot[];
}

async function createReservation(payload: {
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  notes?: string;
}): Promise<Reservation> {
  const res = await fetch(`${API_BASE}${ENDPOINTS.RESERVATIONS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.message ?? data.errors?.[Object.keys(data.errors ?? {})[0]]?.[0] ?? "Could not make reservation.";
    throw new Error(msg);
  }
  return data.reservation as Reservation;
}

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

const today = () => new Date().toISOString().split("T")[0];

export function ReservationPage() {
  const navigate = useNavigate();

  useEffect(() => { document.title = 'Reserve a Table — Bake & Grill'; }, []);

  const [step, setStep] = useState<"form" | "slots" | "confirm" | "done">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(tomorrow());
  const [notes, setNotes] = useState("");

  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);

  const loadSlots = async () => {
    if (!date || partySize < 1) return;
    setLoading(true);
    setError("");
    try {
      const data = await getSlots(date, partySize);
      setSlots(data);
      setStep("slots");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!selectedSlot) { setError("Please select a time slot."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await createReservation({
        customer_name:  name.trim(),
        customer_phone: phone.trim(),
        party_size:     partySize,
        date,
        time_slot:      selectedSlot,
        notes:          notes.trim() || undefined,
      });
      setReservation(res);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.back} onClick={() => navigate("/")}>← Menu</button>
        <h1 style={s.title}>Table Reservation</h1>
      </div>

      <div style={s.card}>
        {step === "done" && reservation ? (
          <div style={{ textAlign: "center" }}>
            <div style={s.successIcon}>✓</div>
            <h2 style={s.heading}>Reservation Confirmed!</h2>
            <p style={s.sub}>
              <b>{reservation.customer_name}</b> — {reservation.party_size} guests<br />
              {reservation.date} at {reservation.time_slot}
            </p>
            {reservation.table && (
              <p style={s.sub}>Table: <b>{reservation.table.name}</b></p>
            )}
            <p style={{ ...s.sub, color: "#6b7280", fontSize: 13 }}>
              You'll receive an SMS confirmation shortly.
            </p>
            <p style={{ ...s.sub, color: "#6b7280", fontSize: 12 }}>
              Reference: <code>#{reservation.id}</code>
            </p>
            <button style={s.btn} onClick={() => navigate("/")}>Back to Menu</button>
          </div>
        ) : step === "slots" ? (
          <>
            <button style={s.backLink} onClick={() => setStep("form")}>← Change details</button>
            <h2 style={s.heading}>Select a Time Slot</h2>
            <p style={s.sub}>{date} · {partySize} guests</p>
            {error && <div style={s.error}>{error}</div>}
            <div style={s.slotGrid}>
              {slots.length === 0 ? (
                <p style={s.sub}>No available slots for this date. Try another date.</p>
              ) : (
                slots.map((slot) => (
                  <button
                    key={slot.time_slot}
                    disabled={!slot.available}
                    onClick={() => setSelectedSlot(slot.time_slot)}
                    style={{
                      ...s.slotBtn,
                      ...(slot.time_slot === selectedSlot ? s.slotSelected : {}),
                      ...(slot.available ? {} : s.slotDisabled),
                    }}
                  >
                    {slot.time_slot}
                  </button>
                ))
              )}
            </div>
            {selectedSlot && (
              <button style={s.btn} disabled={loading} onClick={handleBook}>
                {loading ? "Booking…" : `Book for ${selectedSlot}`}
              </button>
            )}
          </>
        ) : (
          <>
            <h2 style={s.heading}>Make a Reservation</h2>
            {error && <div style={s.error}>{error}</div>}

            <label style={s.label}>Your Name</label>
            <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />

            <label style={s.label}>Phone Number</label>
            <input style={s.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 7654321" type="tel" />

            <label style={s.label}>Party Size</label>
            <div style={s.stepper}>
              <button style={s.stepBtn} onClick={() => setPartySize(p => Math.max(1, p - 1))}>−</button>
              <span style={s.stepVal}>{partySize}</span>
              <button style={s.stepBtn} onClick={() => setPartySize(p => Math.min(20, p + 1))}>+</button>
            </div>

            <label style={s.label}>Date</label>
            <input
              style={s.input}
              type="date"
              value={date}
              min={today()}
              onChange={e => setDate(e.target.value)}
            />

            <label style={s.label}>Special Requests (optional)</label>
            <textarea style={{ ...s.input, resize: "vertical", minHeight: 72 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Allergies, celebrations, seating preferences…" />

            <button
              style={s.btn}
              disabled={!name.trim() || !phone.trim() || !date || loading}
              onClick={loadSlots}
            >
              {loading ? "Checking availability…" : "Check Availability →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const amber = "#D97706";
const amberLight = "#FEF3C7";

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#F9FAFB", fontFamily: "system-ui, sans-serif" },
  header: { background: "#1C1917", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 },
  back: { background: "none", border: "none", color: "#D1D5DB", cursor: "pointer", fontSize: 15 },
  title: { color: "white", fontSize: 22, fontWeight: 700, margin: 0 },
  card: { maxWidth: 520, margin: "32px auto", background: "white", borderRadius: 16, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },
  heading: { fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "#1C1917" },
  sub: { fontSize: 15, color: "#374151", margin: "0 0 16px" },
  label: { display: "block", fontWeight: 600, fontSize: 14, color: "#374151", marginBottom: 6, marginTop: 16 },
  input: { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 15, boxSizing: "border-box" as const, outline: "none" },
  stepper: { display: "flex", alignItems: "center", gap: 16, marginTop: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: "50%", border: `2px solid ${amber}`, background: "none", color: amber, fontSize: 20, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  stepVal: { fontSize: 22, fontWeight: 700, color: "#1C1917", minWidth: 32, textAlign: "center" as const },
  btn: { marginTop: 24, width: "100%", padding: "13px 0", borderRadius: 12, background: amber, color: "white", fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer" },
  error: { background: "#FEE2E2", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, fontSize: 14, marginBottom: 12 },
  backLink: { background: "none", border: "none", color: amber, cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 12 },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 },
  slotBtn: { padding: "10px 0", borderRadius: 10, border: `2px solid #E5E7EB`, background: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#374151" },
  slotSelected: { borderColor: amber, background: amberLight, color: amber },
  slotDisabled: { opacity: 0.4, cursor: "not-allowed" },
  successIcon: { fontSize: 56, color: "#10B981", marginBottom: 12 },
};
