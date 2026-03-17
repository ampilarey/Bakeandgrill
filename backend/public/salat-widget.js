/**
 * Salath Prayer Times Widget — v2
 * Drop-in vanilla JS widget for any website.
 *
 * Usage:
 *   <div data-salat-widget data-island-id="1" data-api-base="https://salath.yourdomain.mv"></div>
 *   <script src="https://salath.yourdomain.mv/widget.js"></script>
 *
 * Attributes on the container element:
 *   data-island-id  — initial island id (optional, defaults to Malé or geolocation)
 *   data-api-base   — base URL of the Salath API (defaults to same origin as this script)
 *   data-theme      — "dark" (default) | "light"
 *   data-lang       — "dv" (default, Dhivehi) | "en"
 */
(function (global) {
    'use strict';

    /* Derive the script's own origin so font URLs work from any domain. */
    const SCRIPT_ORIGIN = (function () {
        const scripts = document.getElementsByTagName('script');
        const last    = scripts[scripts.length - 1];
        try {
            const u = new URL(last.src);
            return u.origin;
        } catch {
            return '';
        }
    })();

    /* ── CSS ── */
    const CSS = `
.sw-wrap{font-family:'A_Faruma','MV Faseyha','MV Waheed',serif;direction:rtl;box-sizing:border-box}
.sw-wrap *{box-sizing:border-box}
.sw-wrap.sw-dark{--bg:#1e293b;--bg2:#263347;--border:#334155;--text:#f1f5f9;--muted:#94a3b8;--primary:#38bdf8;--accent:#f59e0b;--next-bg:rgba(56,189,248,.12)}
.sw-wrap.sw-light{--bg:#FFFDF8;--bg2:#F0E8D5;--border:#E8DDC5;--text:#1F1A17;--muted:#7C6E58;--primary:#0F5C4D;--accent:#C9A227;--next-bg:rgba(15,92,77,.06)}
.sw-wrap{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:1.25rem;color:var(--text)}
.sw-top{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem}
.sw-select{flex:1;min-width:140px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;font-size:.9rem;font-family:inherit;outline:none;cursor:pointer}
.sw-select:focus{border-color:var(--primary)}
.sw-geo{background:transparent;color:var(--primary);border:1px solid var(--primary);border-radius:8px;padding:.5rem .75rem;font-size:.8rem;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background .2s}
.sw-geo:hover{background:rgba(15,92,77,.08)}
.sw-countdown{background:var(--next-bg);border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap}
.sw-next-label{font-size:.75rem;color:var(--muted);flex:0 0 100%;margin-bottom:.25rem}
.sw-next-name{font-size:1.1rem;font-weight:700;color:var(--primary)}
.sw-next-at{font-size:.8rem;color:var(--muted);margin-inline-start:.4rem}
.sw-timer{font-family:monospace,sans-serif;font-size:1.4rem;font-weight:700;color:var(--accent);letter-spacing:.04em}
.sw-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem}
@media(max-width:400px){.sw-grid{grid-template-columns:repeat(2,1fr)}}
.sw-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:.7rem .8rem;display:flex;flex-direction:column;align-items:center;gap:.3rem;transition:border-color .2s;position:relative;overflow:hidden}
.sw-card.next{border-color:var(--primary);background:var(--next-bg)}
.sw-card.past{opacity:.5}
.sw-card.sunrise-card{border-style:dashed;opacity:.75}
.sw-card-next-badge{position:absolute;top:.3rem;left:.4rem;font-size:.6rem;color:var(--primary);background:rgba(15,92,77,.1);padding:.1rem .35rem;border-radius:4px;font-weight:600}
.sw-icon{font-size:1.35rem;line-height:1}
.sw-name{font-size:.78rem;font-weight:600;color:var(--text);text-align:center}
.sw-latin{font-size:.65rem;color:var(--muted);font-family:monospace,sans-serif}
.sw-time{font-size:1.1rem;font-weight:700;color:var(--text);font-family:monospace,sans-serif;letter-spacing:.02em}
.sw-card.next .sw-time{color:var(--primary)}
.sw-loading{text-align:center;padding:2rem;color:var(--muted);font-size:.9rem}
.sw-error{text-align:center;padding:1rem;color:#f87171;font-size:.85rem;direction:ltr}
`;

    const PRAYER_META = {
        fajr:    { dv: 'ފަތިސް',       en: 'Fajr',    icon: '🌙', isSalah: true  },
        sunrise: { dv: 'އިރު އެރުން',   en: 'Sunrise', icon: '🌅', isSalah: false },
        dhuhr:   { dv: 'މެންދުރު',      en: 'Dhuhr',   icon: '☀️', isSalah: true  },
        asr:     { dv: 'އަޞްރު',        en: 'Asr',     icon: '🌤', isSalah: true  },
        maghrib: { dv: 'މަޣްރިބް',      en: 'Maghrib', icon: '🌆', isSalah: true  },
        isha:    { dv: 'ޢިޝާ',          en: 'Isha',    icon: '🌟', isSalah: true  },
    };

    const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

    /* ── Inject CSS + font (once per page) ── */
    function injectStyles(apiBase) {
        if (document.getElementById('sw-styles')) return;

        const style = document.createElement('style');
        style.id    = 'sw-styles';
        style.textContent = CSS;
        document.head.appendChild(style);

        const fontBase = apiBase || SCRIPT_ORIGIN;
        const fontStyle = document.createElement('style');
        fontStyle.textContent = "@font-face{font-family:'A_Faruma';src:url('" + fontBase + "/fonts/a_faruma.ttf') format('truetype');font-display:swap;}";
        document.head.appendChild(fontStyle);
    }

    function parseHHMM(s) {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m;
    }

    function formatCountdown(ms) {
        const s   = Math.max(0, Math.floor(ms / 1000));
        const h   = Math.floor(s / 3600);
        const min = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return [h, min, sec].map(v => String(v).padStart(2, '0')).join(':');
    }

    /* ── Widget constructor ── */
    function Widget(container) {
        const apiBase  = (container.dataset.apiBase || SCRIPT_ORIGIN).replace(/\/$/, '');
        const theme    = container.dataset.theme === 'light' ? 'light' : 'dark';
        const lang     = container.dataset.lang  === 'en'    ? 'en'    : 'dv';

        /* Ensure each widget instance has a unique ID to avoid DOM id collisions */
        if (!container.id) {
            container.id = 'sw-' + Math.random().toString(36).slice(2, 8);
        }
        const uid = container.id;

        let islandId  = parseInt(container.dataset.islandId, 10) || 0;
        let prayerData = null;
        let islands    = [];
        let tickTimer  = null;

        container.className = 'sw-wrap sw-' + theme;
        container.innerHTML = '<div class="sw-loading">' + (lang === 'dv' ? 'ލޯޑު ވަނީ...' : 'Loading...') + '</div>';

        function render(prayers) {
            prayerData = prayers;

            container.innerHTML = `
                <div class="sw-top">
                    <select class="sw-select" id="${uid}-sel"></select>
                    <button class="sw-geo" id="${uid}-geo">
                        📍 ${lang === 'dv' ? 'ތިބާ ހުރި ތަން' : 'My location'}
                    </button>
                </div>
                <div class="sw-countdown" id="${uid}-cd">
                    <div class="sw-next-label">${lang === 'dv' ? 'ދެން ވަންނަ ނަމާދު' : 'Next prayer'}</div>
                    <div>
                        <span class="sw-next-name" id="${uid}-nn">–</span>
                        <span class="sw-next-at"   id="${uid}-nt"></span>
                    </div>
                    <div class="sw-timer" id="${uid}-tm">––:––:––</div>
                </div>
                <div class="sw-grid" id="${uid}-grid"></div>
            `;

            /* Populate island select */
            const sel    = document.getElementById(uid + '-sel');
            const groups = {};
            islands.forEach(isl => {
                const key = isl.atoll || 'Other';
                (groups[key] = groups[key] || []).push(isl);
            });
            Object.entries(groups).forEach(([atoll, list]) => {
                const og = document.createElement('optgroup');
                og.label = atoll;
                list.forEach(isl => {
                    const opt      = document.createElement('option');
                    opt.value      = isl.id;
                    opt.textContent = isl.name;
                    if (isl.id === islandId) opt.selected = true;
                    og.appendChild(opt);
                });
                sel.appendChild(og);
            });
            sel.addEventListener('change', () => {
                islandId = parseInt(sel.value, 10);
                loadTimes();
            });

            /* Geo button */
            document.getElementById(uid + '-geo').addEventListener('click', geoLocate);

            /* Prayer cards */
            const grid = document.getElementById(uid + '-grid');
            KEYS.forEach(key => {
                const meta = PRAYER_META[key];
                const div  = document.createElement('div');
                div.className        = 'sw-card' + (key === 'sunrise' ? ' sunrise-card' : '');
                div.dataset.key      = key;
                div.dataset.time     = prayers[key];
                div.dataset.isSalah  = meta.isSalah ? '1' : '0';
                div.innerHTML = `
                    <div class="sw-icon">${meta.icon}</div>
                    <div class="sw-name">${meta[lang]}</div>
                    <div class="sw-latin">${meta.en}</div>
                    <div class="sw-time">${prayers[key]}</div>
                `;
                grid.appendChild(div);
            });

            if (tickTimer) clearInterval(tickTimer);
            tick();
            tickTimer = setInterval(tick, 1000);
        }

        function tick() {
            if (!prayerData) return;
            const now    = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();

            let nextKey  = null;
            let nextTime = null;

            container.querySelectorAll('.sw-card').forEach(card => {
                card.classList.remove('next', 'past');
                card.querySelector('.sw-card-next-badge')?.remove();

                const t       = parseHHMM(card.dataset.time);
                const isSalah = card.dataset.isSalah === '1';

                if (!nextKey && isSalah && t > nowMin) {
                    nextKey  = card.dataset.key;
                    nextTime = card.dataset.time;
                    card.classList.add('next');
                    const badge       = document.createElement('span');
                    badge.className   = 'sw-card-next-badge';
                    badge.textContent = lang === 'dv' ? 'ދެން' : 'next';
                    card.prepend(badge);
                } else if (t <= nowMin) {
                    card.classList.add('past');
                }
            });

            const nnEl = document.getElementById(uid + '-nn');
            const ntEl = document.getElementById(uid + '-nt');
            const tmEl = document.getElementById(uid + '-tm');
            if (!nnEl) return;

            if (nextKey) {
                nnEl.textContent = PRAYER_META[nextKey][lang];
                ntEl.textContent = nextTime;
                const [nh, nm] = nextTime.split(':').map(Number);
                const target   = new Date();
                target.setHours(nh, nm, 0, 0);
                tmEl.textContent = formatCountdown(target - now);
            } else {
                nnEl.textContent = lang === 'dv' ? 'ދެން ވަންނަ ނަމާދު ނެތް' : 'No more prayers today';
                ntEl.textContent = '';
                tmEl.textContent = '––:––:––';
            }
        }

        function loadTimes() {
            const today = new Date().toISOString().slice(0, 10);
            fetch(apiBase + '/api/prayer-times?island_id=' + islandId + '&date=' + today)
                .then(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(data => {
                    if (data && data.prayers) {
                        render(data.prayers);
                    } else {
                        throw new Error('Invalid response');
                    }
                })
                .catch(err => {
                    container.innerHTML = '<div class="sw-error">Could not load prayer times. ' + err.message + '</div>';
                });
        }

        function geoLocate() {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
                pos => {
                    const { latitude, longitude } = pos.coords;
                    fetch(apiBase + '/api/prayer-times/nearest?lat=' + latitude + '&lng=' + longitude)
                        .then(r => {
                            if (!r.ok) throw new Error('HTTP ' + r.status);
                            return r.json();
                        })
                        .then(data => {
                            if (data && data.island) {
                                islandId = data.island.id;
                                loadTimes();
                            }
                        })
                        .catch(() => {/* silently ignore — user stays on current island */});
                },
                () => {/* geolocation denied or unavailable — no action needed */}
            );
        }

        /* ── Boot: fetch island list then prayer times ── */
        fetch(apiBase + '/api/prayer-times/islands')
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(data => {
                islands = (data.islands || []);
                if (!islandId && islands.length) {
                    const male = islands.find(i => i.name === 'މާލެ') || islands[0];
                    islandId   = male.id;
                }
                loadTimes();
            })
            .catch(() => {
                container.innerHTML = '<div class="sw-error">Could not reach server.</div>';
            });
    }

    /* ── Auto-init ── */
    function init() {
        const containers = document.querySelectorAll('[data-salat-widget]');
        containers.forEach((el, i) => {
            const apiBase = (el.dataset.apiBase || SCRIPT_ORIGIN).replace(/\/$/, '');
            injectStyles(apiBase);
            if (!el.id) el.id = 'sw-' + i + '-' + Math.random().toString(36).slice(2, 6);
            new Widget(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.SalatWidget = Widget;

})(window);
