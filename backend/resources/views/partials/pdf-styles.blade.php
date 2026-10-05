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
        background: #FFFFFF;
        line-height: 1.45;
    }
    .pdf-page { padding: 28px 32px 24px; }
    /* Owner, 2026-10-06: the logo's dark lettering vanished on the dark band.
       It sits in a cream tile with a rust ring, as on the website and the
       receipt page. Tables, not inline spans: dompdf lays out tables reliably. */
    .pdf-masthead {
        background: {{ $brandDark }};
        color: #FFFDF9;
        border-radius: 10px;
        padding: 14px 18px;
        margin-bottom: 18px;
        border-bottom: 3px solid {{ $brandPrimary }};
    }
    table.pdf-masthead-row { width: 100%; border-collapse: collapse; }
    table.pdf-masthead-row td { vertical-align: middle; padding: 0; }
    td.pdf-masthead-logo-cell { width: 64px; }
    .pdf-masthead-logo {
        width: 50px;
        height: 50px;
        padding: 3px;
        background: #F7F5F2;
        border: 2px solid #C56F3D;
        border-radius: 10px;
    }
    .pdf-masthead-logo img { width: 50px; height: 50px; border-radius: 7px; }
    .pdf-masthead-name {
        font-size: 18px;
        font-weight: bold;
        color: #FFFDF9;
        line-height: 1.2;
    }
    .pdf-masthead-tagline {
        font-size: 8.5px;
        font-weight: bold;
        color: #E3C9AE;
        margin-top: 3px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    td.pdf-masthead-meta { text-align: right; }
    .pdf-doc-type {
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #C56F3D;
    }
    .pdf-doc-number {
        font-size: 15px;
        font-weight: bold;
        color: #FFFDF9;
        margin-top: 2px;
    }
    .pdf-status {
        display: inline-block;
        margin-top: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .pdf-status--paid { background: #D6F0E2; color: #195C36; }
    .pdf-status--pending { background: #FCE4E1; color: #8C1C0E; }
    .pdf-status--sent { background: #E3ECFB; color: #1d4ed8; }
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
        font-weight: bold;
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
        font-weight: bold;
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
    .pdf-totals-row span:last-child { text-align: right; font-weight: bold; }
    .pdf-totals-grand {
        display: table;
        width: 100%;
        margin-top: 6px;
        padding-top: 8px;
        border-top: 2px solid {{ $brandPrimary }};
        font-size: 13px;
        font-weight: bold;
        color: {{ $brandPrimary }};
    }
    .pdf-totals-grand span { display: table-cell; }
    .pdf-totals-grand span:last-child { text-align: right; }
    .pdf-totals-refund { color: #8C1C0E; font-weight: bold; }
    .pdf-totals-due { color: #8C1C0E; border-top-color: #8C1C0E; }
    .pdf-pay-online {
        margin-top: 16px;
        padding: 10px 14px;
        border: 2px solid {{ $brandPrimary }};
        border-radius: 10px;
        background: #F9F1EC;
        font-size: 10.5px;
        color: {{ $brandDark }};
    }
    .pdf-pay-online strong { color: {{ $brandPrimary }}; font-size: 12px; }
    .pdf-pay-online a { color: {{ $brandPrimary }}; font-weight: bold; text-decoration: underline; }
    .pdf-section-title {
        font-size: 8px;
        font-weight: bold;
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
    .pdf-payments-row span:last-child { text-align: right; font-weight: bold; }
    .pdf-notes {
        margin-top: 16px;
        padding: 10px 12px;
        background: #FBF8F4;
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
    .pdf-footer strong { color: {{ $brandDark }}; display: block; margin-bottom: 3px; font-size: 10px; }
    .pdf-footer-logo { width: 30px; height: 30px; border-radius: 7px; margin: 0 auto 5px; }
    .pdf-footer-thanks { margin-top: 6px; color: {{ $brandPrimary }}; font-weight: bold; }
</style>
