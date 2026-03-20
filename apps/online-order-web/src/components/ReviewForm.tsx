import { useState } from "react";
import { submitReview } from "../api";

interface Props {
  orderId: number;
  token: string;
  onDone: () => void;
}

export function ReviewForm({ orderId, token, onDone }: Props) {
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [anon, setAnon]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState(false);

  const submit = async () => {
    if (!rating) { setError("Please select a rating."); return; }
    setLoading(true);
    setError("");
    try {
      await submitReview(token, { order_id: orderId, rating, comment, is_anonymous: anon });
      setDone(true);
      setTimeout(onDone, 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={s.card}>
        <p style={{ textAlign: "center", fontSize: 18 }}>⭐ Thanks for your feedback!</p>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <h3 style={s.title}>Rate your order</h3>
      {error && <div style={s.err}>{error}</div>}

      {/* Stars */}
      <div style={s.stars}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            style={{ ...s.star, color: n <= (hovered || rating) ? "var(--color-primary)" : "var(--color-border)" }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} star`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        style={s.textarea}
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Share your experience (optional)…"
        rows={3}
      />

      <label style={s.checkRow}>
        <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} />
        <span style={{ fontSize: 13 }}>Post anonymously</span>
      </label>

      <button style={s.btn} disabled={loading || !rating} onClick={submit}>
        {loading ? "Submitting…" : "Submit Review"}
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card:     { background: "var(--color-surface)", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid var(--color-border)" },
  title:    { fontSize: 16, fontWeight: 700, margin: "0 0 14px", color: "var(--color-text)" },
  stars:    { display: "flex", gap: 6, marginBottom: 14 },
  star:     { fontSize: 36, background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.1s" },
  textarea: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--color-border)", fontSize: 14, resize: "vertical" as const, boxSizing: "border-box" as const, background: "var(--color-surface)", color: "var(--color-text)" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", color: "var(--color-text)" },
  btn:      { marginTop: 14, width: "100%", padding: "12px 0", borderRadius: 12, background: "var(--color-primary)", color: "white", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" },
  err:      { background: "var(--color-error-bg)", color: "var(--color-error)", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 },
};
