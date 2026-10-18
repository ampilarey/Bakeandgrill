import { Check } from 'lucide-react';

/**
 * Pick the font Dhivehi text is set in (2026-10-18): one of the shipped faces or a
 * file you upload. The value is '' (Faruma), "preset:<key>" or an uploaded file's URL,
 * read by App\Domains\Content\DhivehiFont (PRESETS there must match FONT_CHOICES here).
 */
export const FONT_CHOICES: { value: string; label: string; note: string; family: string; files?: { w: number; url: string }[] }[] = [
  { value: '', label: 'Faruma', note: 'The classic Dhivehi face.', family: 'A_Faruma', files: [{ w: 400, url: '/fonts/a_faruma.woff2' }] },
  { value: 'preset:noto', label: 'Noto Sans Thaana', note: 'Clean and modern, with a true bold.', family: 'BG Noto Sans Thaana', files: [{ w: 400, url: '/fonts/noto-sans-thaana-400.woff2' }, { w: 700, url: '/fonts/noto-sans-thaana-700.woff2' }] },
  { value: 'preset:freeserif', label: 'FreeSerif', note: 'Book style, with a bold.', family: 'BG FreeSerif Thaana', files: [{ w: 400, url: '/fonts/freeserif-thaana-400.woff2' }, { w: 700, url: '/fonts/freeserif-thaana-700.woff2' }] },
  { value: 'preset:device', label: "The phone's own", note: "Each phone's built-in Dhivehi font. A phone or computer without one (often iPhones and Macs) shows Faruma.", family: "'Noto Sans Thaana', 'MV Faseyha', 'MV Waheed', 'MV Boli', A_Faruma" },
];

const SAMPLE = 'ބޭކް އެންޑް ގްރިލް — ހެދިކާ، ބާޖިޔާ';
const RANGE = 'U+0780-07BF, U+060C, U+061B, U+061F, U+FDF2';

export const isUploadedFont = (v: string) => /^\/storage\/fonts\/[a-f0-9]{64}\.(woff2|woff|ttf|otf)$/.test(v);

export function DhivehiFontPicker({ value, onPick, onUpload }: {
  value: string;
  onPick: (value: string) => void;
  onUpload: (file: File) => void;
}) {
  const uploaded = isUploadedFont(value) ? value : '';
  const faces = FONT_CHOICES.flatMap((c) => (c.files ?? []).map((f) => `@font-face{font-family:'${c.family}';font-weight:${f.w};src:url('${f.url}') format('woff2');font-display:swap;unicode-range:${RANGE};}`));
  if (uploaded) faces.push(`@font-face{font-family:'BakeDhivehi';src:url('${uploaded}');font-display:swap;unicode-range:${RANGE};}`);
  const cards = [...FONT_CHOICES, ...(uploaded ? [{ value: uploaded, label: 'Your uploaded font', note: uploaded.split('/').pop() ?? '', family: 'BakeDhivehi' }] : [])];
  const picked = cards.some((c) => c.value === value) ? value : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="dhivehi-font-picker">
      <style>{faces.join('')}</style>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>One font for the website and the order app: a pick here changes both.</p>
      <div role="radiogroup" aria-label="Dhivehi font" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
        {cards.map((c) => {
          const on = c.value === picked;
          return (
            <button
              key={c.value || 'faruma'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(c.value)}
              data-testid={`dv-font-${c.value || 'faruma'}`}
              style={{
                textAlign: 'start', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: on ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)', color: 'var(--color-text)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 13, fontWeight: 700 }}>
                {c.label}
                {on && <Check size={16} aria-hidden="true" style={{ color: 'var(--color-primary)' }} />}
              </span>
              <span lang="dv" dir="rtl" style={{ display: 'block', margin: '6px 0 2px', fontSize: 20, lineHeight: 1.5, fontFamily: c.family.includes(',') ? c.family : `'${c.family}'` }}>{SAMPLE}</span>
              <span lang="dv" dir="rtl" style={{ display: 'block', fontSize: 16, fontWeight: 700, fontFamily: c.family.includes(',') ? c.family : `'${c.family}'` }}>މިއަދުގެ ސްޕެޝަލް</span>
              <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>{c.note}</span>
            </button>
          );
        })}
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Or upload your own (TTF or OTF; WOFF and WOFF2 when the server can read them):
        <input
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
      </label>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
        Only use a font you are allowed to put on a website. Labels follow this choice when Labels → Settings uses the website's font.
      </p>
    </div>
  );
}
