@php
    /** @var string $brandPrimary */
    /** @var string $brandDark */
@endphp
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: DejaVu Sans, Arial, sans-serif;
        font-size: 11px;
        color: {{ $brandDark }};
        background: #FFFDF9;
        line-height: 1.45;
    }
    .pdf-page { padding: 28px 32px 24px; }
    .pdf-masthead {
        background: {{ $brandDark }};
        color: #fff;
        border-radius: 10px;
        padding: 16px 18px;
        margin-bottom: 18px;
        border-bottom: 3px solid {{ $brandPrimary }};
    }
    .pdf-masthead-row {
        display: table;
        width: 100%;
    }
    .pdf-masthead-brand {
        display: table-cell;
        vertical-align: middle;
    }
    .pdf-masthead-logo {
        display: inline-block;
        vertical-align: middle;
        width: 42px;
        height: 42px;
        border-radius: 8px;
        object-fit: cover;
        margin-right: 12px;
    }
    .pdf-masthead-name {
        display: inline-block;
        vertical-align: middle;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.02em;
    }
    .pdf-masthead-tagline {
        font-size: 9px;
        color: #F0A96A;
        margin-top: 2px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .pdf-masthead-meta {
        display: table-cell;
        vertical-align: middle;
        text-align: right;
    }
    .pdf-doc-type {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #F0A96A;
    }
    .pdf-doc-number {
        font-size: 15px;
        font-weight: 700;
        margin-top: 2px;
    }
    .pdf-status {
        display: inline-block;
        margin-top: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .pdf-status--paid { background: #D6F0E2; color: #195C36; }
    .pdf-status--pending { background: #FEF3E8; color: #92400e; }
    .pdf-status--sent { background: #eff6ff; color: #1d4ed8; }
    .pdf-meta-grid {
        display: table;
        width: 100%;
        margin-bottom: 16px;
    }
    .pdf-meta-col {
        display: table-cell;
        width: 50%;
        vertical-align: top;
        padding-right: 12px;
    }
    .pdf-meta-label {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8B7355;
        margin-bottom: 4px;
    }
    .pdf-meta-value { font-size: 11px; color: {{ $brandDark }}; }
    .pdf-meta-value + .pdf-meta-value { margin-top: 3px; color: #8B7355; }
    table.pdf-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 14px;
    }
    .pdf-table thead th {
        background: #FEF3E8;
        color: {{ $brandPrimary }};
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 8px 10px;
        text-align: left;
        border-bottom: 2px solid {{ $brandPrimary }};
    }
    .pdf-table thead th.right,
    .pdf-table tbody td.right { text-align: right; }
    .pdf-table thead th.center,
    .pdf-table tbody td.center { text-align: center; }
    .pdf-table tbody td {
        padding: 8px 10px;
        border-bottom: 1px solid #EDE4D4;
        vertical-align: top;
        font-size: 11px;
    }
    .pdf-table tbody tr:nth-child(even) td { background: rgba(254, 243, 232, 0.35); }
    .pdf-mods { font-size: 9px; color: #8B7355; margin-top: 2px; }
    .pdf-totals {
        margin-left: auto;
        width: 260px;
        margin-top: 4px;
    }
    .pdf-totals-row {
        display: table;
        width: 100%;
        padding: 4px 0;
        font-size: 11px;
        color: #5C4A2A;
    }
    .pdf-totals-row span { display: table-cell; }
    .pdf-totals-row span:last-child { text-align: right; font-weight: 600; }
    .pdf-totals-grand {
        display: table;
        width: 100%;
        margin-top: 6px;
        padding-top: 8px;
        border-top: 2px solid {{ $brandPrimary }};
        font-size: 13px;
        font-weight: 700;
        color: {{ $brandPrimary }};
    }
    .pdf-totals-grand span { display: table-cell; }
    .pdf-totals-grand span:last-child { text-align: right; }
    .pdf-totals-refund { color: #8C1C0E; font-weight: 700; }
    .pdf-section-title {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8B7355;
        margin: 12px 0 6px;
    }
    .pdf-payments-row {
        display: table;
        width: 100%;
        font-size: 10px;
        padding: 3px 0;
        border-bottom: 1px dashed #EDE4D4;
    }
    .pdf-payments-row span { display: table-cell; }
    .pdf-payments-row span:last-child { text-align: right; font-weight: 600; }
    .pdf-notes {
        margin-top: 16px;
        padding: 10px 12px;
        background: #FFFDF9;
        border: 1px solid #EDE4D4;
        border-radius: 8px;
        font-size: 10px;
        color: #5C4A2A;
    }
    .pdf-footer {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid #EDE4D4;
        text-align: center;
        font-size: 9px;
        color: #8B7355;
    }
    .pdf-footer strong { color: {{ $brandDark }}; display: block; margin-bottom: 3px; }
</style>
