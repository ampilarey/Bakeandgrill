import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchReservationSlots, createReservation } from "../api";
import type { ReservationSlot, CustomerReservation } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";
import { PageHeader } from "../components/shell/PageHeader";
import { useLanguage } from "../context/LanguageContext";

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

const today = () => new Date().toISOString().split("T")[0];

export function ReservationPage() {
  usePageTitle('Reserve a Table');
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [step, setStep] = useState<"form" | "slots" | "confirm" | "done">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [maxPartySize, setMaxPartySize] = useState(20);
  const [date, setDate] = useState(tomorrow());
  const [notes, setNotes] = useState("");

  const [slots, setSlots] = useState<ReservationSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [reservation, setReservation] = useState<CustomerReservation | null>(null);

  useEffect(() => {
    // Soft-fetch max party size for the stepper before the customer checks slots.
    void fetchReservationSlots(tomorrow(), 1)
      .then((data) => {
        if (data.max_party_size > 0) {
          setMaxPartySize(data.max_party_size);
          setPartySize((p) => Math.min(p, data.max_party_size));
        }
      })
      .catch(() => { /* keep default */ });
  }, []);

  const loadSlots = async () => {
    if (!date || partySize < 1) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchReservationSlots(date, partySize);
      setSlots(data.slots);
      if (data.max_party_size > 0) {
        setMaxPartySize(data.max_party_size);
        setPartySize((p) => Math.min(p, data.max_party_size));
      }
      setStep("slots");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!selectedSlot) { setError(t("reserve.err_slot")); return; }
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
    <>
      <PageHeader title={t("reserve.page_title")} onBack={() => navigate(-1)} />
      <div style={s.page}>
      <div style={s.card}>
        {step === "done" && reservation ? (
          <div style={{ textAlign: "center" }}>
            <div style={s.successIcon}>✓</div>
            <h2 style={s.heading}>{t("reserve.confirmed")}</h2>
            <p style={s.sub}>
              <b>{reservation.customer_name}</b> — {t("reserve.guests").replace("{n}", String(reservation.party_size))}<br />
              {reservation.date} at {reservation.time_slot}
            </p>
            {reservation.table && (
              <p style={s.sub}>{t("reserve.table").replace("{name}", reservation.table.name)}</p>
            )}
            <p style={{ ...s.sub, color: "var(--color-text-muted)", fontSize: 13 }}>
              {t("reserve.sms_soon")}
            </p>
            <p style={{ ...s.sub, color: "var(--color-text-muted)", fontSize: 12 }}>
              {t("reserve.reference").replace("{id}", String(reservation.id))}
            </p>
            <button style={s.btn} onClick={() => navigate("/menu")}>{t("reserve.back_menu")}</button>
          </div>
        ) : step === "slots" ? (
          <>
            <button style={s.backLink} onClick={() => setStep("form")}>{t("reserve.change_details")}</button>
            <h2 style={s.heading}>{t("reserve.heading_slots")}</h2>
            <p style={s.sub}>{date} · {t("reserve.guests").replace("{n}", String(partySize))}</p>
            {error && <div style={s.error}>{error}</div>}
            <div style={s.slotGrid}>
              {slots.length === 0 ? (
                <p style={s.sub}>{t("reserve.no_slots")}</p>
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
                    {slot.available && slot.remaining_capacity <= 4 ? (
                      <span style={s.slotLeft}> · {slot.remaining_capacity} left</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            {selectedSlot && (
              <button style={s.btn} disabled={loading} onClick={handleBook}>
                {loading ? t("reserve.booking") : t("reserve.book_for").replace("{slot}", selectedSlot)}
              </button>
            )}
          </>
        ) : (
          <>
            <h2 style={s.heading}>{t("reserve.heading_form")}</h2>
            {error && <div style={s.error}>{error}</div>}

            <label htmlFor="rsv-name" style={s.label}>{t("reserve.label_name")}</label>
            <input id="rsv-name" style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder={t("reserve.ph_name")} />

            <label htmlFor="rsv-phone" style={s.label}>{t("reserve.label_phone")}</label>
            <input id="rsv-phone" style={s.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder={t("reserve.ph_phone")} type="tel" />

            <label style={s.label}>{t("reserve.label_party")}</label>
            <div style={s.stepper}>
              <button style={s.stepBtn} onClick={() => setPartySize(p => Math.max(1, p - 1))} aria-label={t("reserve.party_dec")}>−</button>
              <span style={s.stepVal} aria-live="polite">{partySize}</span>
              <button style={s.stepBtn} onClick={() => setPartySize(p => Math.min(maxPartySize, p + 1))} aria-label={t("reserve.party_inc")}>+</button>
            </div>

            <label htmlFor="rsv-date" style={s.label}>{t("reserve.label_date")}</label>
            <input
              id="rsv-date"
              style={s.input}
              type="date"
              value={date}
              min={today()}
              onChange={e => setDate(e.target.value)}
            />

            <label htmlFor="rsv-notes" style={s.label}>{t("reserve.label_notes")}</label>
            <textarea id="rsv-notes" style={{ ...s.input, resize: "vertical", minHeight: 72 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("reserve.ph_notes")} />

            <button
              style={s.btn}
              disabled={!name.trim() || !phone.trim() || !date || loading}
              onClick={loadSlots}
            >
              {loading ? t("reserve.checking") : t("reserve.check_cta")}
            </button>
          </>
        )}
      </div>
    </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--color-bg)", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" },
  card: { maxWidth: 520, margin: "32px auto", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" },
  heading: { fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "var(--color-text)" },
  sub: { fontSize: 15, color: "var(--color-text-muted)", margin: "0 0 16px" },
  label: { display: "block", fontWeight: 600, fontSize: 14, color: "var(--color-text)", marginBottom: 6, marginTop: 16 },
  input: { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--color-border)", fontSize: 15, boxSizing: "border-box" as const, outline: "none", background: "var(--color-surface)", color: "var(--color-text)" },
  stepper: { display: "flex", alignItems: "center", gap: 16, marginTop: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: "50%", border: "2px solid var(--color-primary)", background: "none", color: "var(--color-primary)", fontSize: 20, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  stepVal: { fontSize: 22, fontWeight: 700, color: "var(--color-text)", minWidth: 32, textAlign: "center" as const },
  btn: { marginTop: 24, width: "100%", padding: "13px 0", borderRadius: 12, background: "var(--color-primary)", color: "white", fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer" },
  error: { background: "var(--color-error-bg)", color: "var(--color-error)", padding: "10px 14px", borderRadius: 8, fontSize: 14, marginBottom: 12 },
  backLink: { background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 12 },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 },
  slotBtn: { padding: "10px 0", borderRadius: 10, border: "2px solid var(--color-border)", background: "var(--color-surface)", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--color-text)" },
  slotLeft: { fontSize: 11, fontWeight: 500, color: "var(--color-text-muted)" },
  slotSelected: { borderColor: "var(--color-primary)", background: "var(--color-primary-light)", color: "var(--color-primary)" },
  slotDisabled: { opacity: 0.4, cursor: "not-allowed" },
  successIcon: { fontSize: 56, color: "var(--color-success)", marginBottom: 12 },
};
