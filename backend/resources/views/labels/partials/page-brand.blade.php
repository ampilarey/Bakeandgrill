{{--
  The look the pack page and the box page share (owner, 2026-11-14: "enhance the qr info page with bake and grill
  branding"): a dark hero with the brand's flames and logo, and the card that says who made it. Phone first.
  The hero keeps its own colours in both themes: it is a dark surface, like the label's footer band.
--}}
<meta name="robots" content="noindex">
<style>
.lp-hero { position: relative; overflow: hidden; background: #24160B; color: #FFFDF9; text-align: center; padding: 1.75rem 1.25rem 2rem; }
.lp-hero::before { content: ""; position: absolute; inset: 0; background: url('{{ asset('brand/flame-pattern.svg') }}') 0 0 / 96px 96px; opacity: 0.07; pointer-events: none; }
.lp-hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: linear-gradient(90deg, #B74B0C, #F2B441 50%, #B74B0C); }
.lp-hero > * { position: relative; }
.lp-logo { display: block; width: 76px; height: 76px; object-fit: contain; margin: 0 auto 0.35rem; }
.lp-brand { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #F2D9B8; margin: 0; }
.lp-tagline { font-size: 0.8rem; font-style: italic; color: #C56F3D; margin: 0.15rem 0 0; }
.lp-photo { width: 148px; height: 148px; border-radius: 50%; margin: 1.1rem auto 0; padding: 5px; background: linear-gradient(140deg, #F2B441, #B74B0C); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35); }
.lp-photo img { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #FFFDF9; }
.lp-eyebrow { display: inline-block; margin-top: 1.1rem; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #F2B441; }
.lp-hero h1 { font-size: 1.75rem; line-height: 1.15; font-weight: 800; letter-spacing: -0.03em; color: #FFFDF9; margin: 0.3rem 0 0; }
.lp-dv { font-size: 1.2rem; color: #E8D5B5; direction: rtl; margin: 0.3rem 0 0; }
.lp-sub { font-size: 0.88rem; color: #D9C6A8; max-width: 30rem; margin: 0.5rem auto 0; }
.lp-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 0.9rem; }
.lp-chip { display: inline-flex; align-items: center; min-height: 32px; padding: 0.3rem 0.85rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; background: rgba(255, 253, 249, 0.1); color: #FFFDF9; border: 1px solid rgba(255, 253, 249, 0.22); }
.lp-chip.price { background: #F2B441; color: #24160B; border-color: #F2B441; }
.lp-chip.fresh { background: #DDF2E3; color: #195C36; border-color: #DDF2E3; }
.lp-chip.soon, .lp-chip.today { background: #FDF1DC; color: #8A5A00; border-color: #FDF1DC; }
.lp-chip.expired { background: #FCE4E1; color: #8C1C0E; border-color: #FCE4E1; }
.lp-wrap { max-width: 560px; margin: 0 auto; padding: 1.25rem 1rem 4rem; box-sizing: border-box; }
.lp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
.lp-h { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--amber); margin: 0 0 0.4rem; }
.lp-rows { margin: 0; padding: 0; list-style: none; }
.lp-rows li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0; border-top: 1px solid var(--border); font-size: 0.95rem; }
.lp-rows li:first-child { border-top: 0; }
.lp-rows li span { color: var(--muted); }
.lp-rows li span small { display: block; font-size: 0.75rem; }
.lp-rows li b { color: var(--dark); text-align: right; font-weight: 600; }
.lp-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; }
.lp-storage { background: var(--amber); color: #fff; border-radius: 12px; padding: 0.7rem 0.9rem; font-weight: 700; font-size: 0.82rem; letter-spacing: 0.02em; text-align: center; margin-bottom: 1rem; }
.lp-maker { background: #24160B; color: #FFFDF9; border-radius: 18px; padding: 1.2rem 1.25rem 1.3rem; margin: 1.25rem 0 1rem; position: relative; overflow: hidden; }
.lp-maker::before { content: ""; position: absolute; inset: 0; background: url('{{ asset('brand/flame-pattern.svg') }}') 0 0 / 96px 96px; opacity: 0.06; pointer-events: none; }
.lp-maker > * { position: relative; }
.lp-maker-top { display: flex; align-items: center; gap: 0.85rem; }
.lp-maker-top img { width: 58px; height: 58px; object-fit: contain; flex-shrink: 0; }
.lp-maker-top small { display: block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #F2B441; }
.lp-maker-top strong { display: block; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; color: #FFFDF9; }
.lp-maker-top em { display: block; font-size: 0.82rem; color: #C56F3D; }
.lp-maker-lines { margin: 0.9rem 0 0; padding: 0; list-style: none; font-size: 0.9rem; color: #E8D5B5; }
.lp-maker-lines li { padding: 0.2rem 0; }
.lp-maker-lines a { color: #FFFDF9; font-weight: 700; text-decoration: none; }
.lp-actions { display: grid; gap: 0.6rem; margin-top: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); }
.lp-btn { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 0.9rem; border-radius: 12px; font-weight: 700; font-size: 0.95rem; text-decoration: none; text-align: center; }
.lp-btn.gold { background: #F2B441; color: #24160B; }
.lp-btn.line { border: 1.5px solid rgba(255, 253, 249, 0.35); color: #FFFDF9; }
.lp-btn.primary { background: var(--amber); color: #fff; }
.lp-foot { font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 1rem; }
@media (min-width: 601px) {
  .lp-hero { padding: 2.25rem 1.5rem 2.5rem; }
  .lp-hero h1 { font-size: 2.2rem; }
  .lp-photo { width: 176px; height: 176px; }
}
</style>
