@php
    // Blade directives choke on regex arguments, so the strings the script
    // and the card share are worked out here.
    $displayUrl = preg_replace('#^https?://#', '', preg_replace('#\?.*$#', '', $url));
    $logo = $logo ?? null;
    $tagline = $tagline ?? '';
    $contacts = $contacts ?? ['line' => [], 'address' => ''];
    $contactLine = implode('  ·  ', $contacts['line']);
    // Only a data: logo can be drawn on the download canvas without tainting it.
    $canvasLogo = is_string($logo) && str_starts_with($logo, 'data:') ? $logo : null;
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Complaint box poster – {{ $siteName }}</title>
    <style>
        @page { size: A5; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", sans-serif; color: #1C1408; background: #F8F6F3; }
        .sheet { max-width: 440px; margin: 24px auto; background: #fff; border: 1px solid #E8E0D8; border-radius: 20px; overflow: hidden; text-align: center;
                 -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* Owner, 2026-10-03: "enhance the complaint QR print layout with branding,
           like a header or footer". Rust band with the logo on top, dark band
           with how else to reach us at the bottom. */
        .brand { background: #B74B0C; color: #fff; padding: 22px 24px 18px; position: relative; }
        .brand::after { content: ""; position: absolute; left: 0; right: 0; bottom: -6px; height: 6px; background: repeating-linear-gradient(90deg, #B74B0C 0 12px, transparent 12px 18px); }
        .brand__logo { width: 76px; height: 76px; border-radius: 50%; object-fit: cover; background: #fff; border: 3px solid #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.18); display: block; margin: 0 auto 10px; }
        .brand__name { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; margin: 0; line-height: 1.15; color: #fff; }
        .brand__tagline { font-size: 13px; opacity: 0.9; margin: 4px 0 0; color: #fff; line-height: 1.35; }
        .content { padding: 26px 28px 20px; }
        .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #B74B0C; margin: 0 0 8px; }
        h1 { font-size: 30px; letter-spacing: -0.03em; margin: 0 0 8px; line-height: 1.1; }
        p { color: #6B5D4F; font-size: 15px; line-height: 1.5; margin: 0 0 18px; }
        .qr { position: relative; width: 248px; height: 248px; margin: 0 auto 12px; padding: 10px; border: 2px solid #F0EBE5; border-radius: 18px; }
        .qr img.code { width: 100%; height: 100%; display: block; }
        .url { font-weight: 700; font-size: 17px; color: #1C1408; word-break: break-all; margin-bottom: 6px; }
        .small { font-size: 12px; color: #9C8E7E; }
        .foot { background: #1C1408; color: #fff; padding: 14px 20px 16px; }
        .foot__line { font-size: 13px; font-weight: 700; letter-spacing: 0.01em; }
        .foot__address { font-size: 11.5px; color: #D9CFC3; margin-top: 4px; }
        .foot__thanks { font-size: 11px; color: #C56F3D; margin-top: 6px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 16px auto 0; max-width: 440px; }
        .print, .download { min-height: 44px; padding: 0 20px; border: none; border-radius: 10px; background: #B74B0C; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
        .download { background: #fff; color: #1C1408; border: 1.5px solid #E8E0D8; }
        .hint { font-size: 12px; color: #9C8E7E; margin: 10px auto 24px; max-width: 440px; text-align: center; padding: 0 16px; }
        @media print {
            body { background: #fff; }
            /* The card fills the A5 sheet edge to edge: header at the top, footer at the bottom. */
            .sheet { border: none; border-radius: 0; margin: 0; max-width: none; width: 148mm; height: 209mm; display: flex; flex-direction: column; }
            /* Measured to fit one A5 sheet (148 x 210 mm) with the footer on it. */
            .sheet { overflow: hidden; }
            .brand { padding: 7mm 10mm 5mm; flex: none; }
            .brand__logo { width: 20mm; height: 20mm; margin-bottom: 2mm; }
            .brand__name { font-size: 24px; }
            .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; padding: 6mm 12mm 4mm; }
            h1 { font-size: 27px; }
            p { font-size: 14px; margin-bottom: 4mm; }
            .qr { width: 72mm; height: 72mm; margin-bottom: 3mm; }
            .foot { padding: 4mm 10mm 5mm; flex: none; }
            .foot__line { font-size: 14px; }
            .actions, .hint { display: none; }
        }
    </style>
</head>
<body>
    <div class="sheet" data-testid="poster-sheet">
        <header class="brand" data-testid="poster-brand">
            @if ($logo)
                <img class="brand__logo" src="{{ $logo }}" alt="{{ $siteName }} logo">
            @endif
            <p class="brand__name">{{ $siteName }}</p>
            @if ($tagline !== '')
                <p class="brand__tagline">{{ $tagline }}</p>
            @endif
        </header>
        <div class="content">
            <p class="eyebrow">Complaint box</p>
            <h1>Not happy? Tell the owner.</h1>
            <p>Staff, food, service, cleanliness — scan and tell us. Anonymous if you like, or leave your number and we will message you back.</p>
            <div class="qr" data-testid="poster-qr">
                {{-- The logo is drawn inside the code's own SVG (owner,
                     2026-09-21), so there is nothing to lay on top here and the
                     PNG export below is one drawImage. --}}
                <img class="code" src="{{ $qr }}" alt="QR code to the complaint form">
            </div>
            <div class="url">{{ $displayUrl }}</div>
            <div class="small">Goes straight to the owner's phone.</div>
        </div>
        <footer class="foot" data-testid="poster-foot">
            @if ($contactLine !== '')
                <div class="foot__line">{{ $contactLine }}</div>
            @endif
            @if ($contacts['address'] !== '')
                <div class="foot__address">{{ $contacts['address'] }}</div>
            @endif
            <div class="foot__thanks">Thank you for helping us do better</div>
        </footer>
    </div>
    <div class="actions">
        <button type="button" class="print" data-print>Print this card</button>
        <button type="button" class="download" data-download>Download QR image</button>
    </div>
    <p class="hint">The image is a 1200 px wide PNG of this whole card — logo, heading, the code and your contact details — ready for a print shop.</p>
    {{-- Owner, 2026-09-19: "where i can download the qr code to past in the
         wall". The SVG code and the logo are both data: URIs on this page, so
         the browser can draw them on a canvas and hand back a PNG without a
         round trip and without tainting the canvas. --}}
    <script nonce="{{ csp_nonce() }}">
    (function () {
        document.querySelector('[data-print]').addEventListener('click', function () { window.print(); });

        var codeImg = document.querySelector('.qr img.code');
        var btn = document.querySelector('[data-download]');

        function load(src) {
            return new Promise(function (resolve, reject) {
                var img = new Image();
                img.onload = function () { resolve(img); };
                img.onerror = reject;
                img.src = src;
            });
        }

        // Owner, 2026-09-19: "Add some details what the code is about" — the
        // image is the whole card, not a bare code, so a printed copy explains
        // itself on the wall.
        var TEXT = {
            name: @json($siteName),
            tagline: @json($tagline),
            eyebrow: 'COMPLAINT BOX',
            title: 'Not happy? Tell the owner.',
            body: 'Staff, food, service, cleanliness — scan and tell us. Anonymous if you like, or leave your number and we will message you back.',
            url: @json($displayUrl),
            note: "Goes straight to the owner's phone.",
            contacts: @json($contactLine),
            address: @json($contacts['address']),
            thanks: 'THANK YOU FOR HELPING US DO BETTER'
        };
        var LOGO = @json($canvasLogo);
        var FONT = '"Plus Jakarta Sans", "Segoe UI", Helvetica, Arial, sans-serif';
        var RUST = '#B74B0C', INK = '#1C1408';

        function wrap(ctx, text, maxWidth) {
            var words = text.split(' '), lines = [], line = '';
            words.forEach(function (w) {
                var t = line ? line + ' ' + w : w;
                if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else { line = t; }
            });
            if (line) lines.push(line);
            return lines;
        }

        // Owner, 2026-10-03: the image carries the same branded header and
        // footer as the printed card — rust band with the logo, dark band
        // with the phone, website, Instagram and address.
        function makePng() {
            var W = 1200, pad = 90, qrSize = 760, logoSize = 220;
            var measure = document.createElement('canvas').getContext('2d');
            measure.font = '34px ' + FONT;
            var bodyLines = wrap(measure, TEXT.body, W - pad * 2);
            measure.font = 'bold 36px ' + FONT;
            var contactLines = TEXT.contacts ? wrap(measure, TEXT.contacts, W - pad * 2) : [];

            var headerH = 70 + (LOGO ? logoSize + 34 : 0) + 64 + (TEXT.tagline ? 50 : 0) + 50;
            var bodyH = 90 + 84 + bodyLines.length * 46 + 40 + qrSize + 60 + 60 + 44 + 70;
            var footH = 56 + contactLines.length * 48 + (TEXT.address ? 44 : 0) + 50 + 46;
            var H = headerH + 14 + bodyH + footH;

            var canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, W, H);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';

            // Header band, then a dashed rust edge like the printed card.
            ctx.fillStyle = RUST;
            ctx.fillRect(0, 0, W, headerH);
            for (var x = 0; x < W; x += 36) ctx.fillRect(x, headerH, 24, 14);

            var waits = [load(codeImg.src)];
            if (LOGO) waits.push(load(LOGO).catch(function () { return null; }));

            return Promise.all(waits).then(function (imgs) {
                var qr = imgs[0], logo = imgs[1] || null;
                var y = 70;
                if (logo) {
                    var cx = W / 2, cy = y + logoSize / 2, r = logoSize / 2;
                    ctx.save();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
                    // Cover-fit the logo into the circle.
                    var s = Math.max(logoSize / logo.width, logoSize / logo.height);
                    var dw = logo.width * s, dh = logo.height * s;
                    ctx.drawImage(logo, cx - dw / 2, cy - dh / 2, dw, dh);
                    ctx.restore();
                    y += logoSize + 34;
                }
                y += 50;
                ctx.fillStyle = '#fff';
                ctx.font = '800 60px ' + FONT;
                ctx.fillText(TEXT.name, W / 2, y);
                if (TEXT.tagline) {
                    y += 50;
                    ctx.globalAlpha = 0.9;
                    ctx.font = '32px ' + FONT;
                    ctx.fillText(TEXT.tagline, W / 2, y);
                    ctx.globalAlpha = 1;
                }

                y = headerH + 14 + 90;
                ctx.fillStyle = RUST;
                ctx.font = 'bold 26px ' + FONT;
                ctx.fillText(TEXT.eyebrow.split('').join(' '), W / 2, y);
                y += 74;
                ctx.fillStyle = INK;
                ctx.font = 'bold 64px ' + FONT;
                ctx.fillText(TEXT.title, W / 2, y);
                y += 58;
                ctx.fillStyle = '#6B5D4F';
                ctx.font = '34px ' + FONT;
                bodyLines.forEach(function (l) { ctx.fillText(l, W / 2, y); y += 46; });
                y += 10;

                var qx = (W - qrSize) / 2;
                ctx.strokeStyle = '#F0EBE5';
                ctx.lineWidth = 6;
                ctx.strokeRect(qx - 24, y - 24, qrSize + 48, qrSize + 48);
                ctx.drawImage(qr, qx, y, qrSize, qrSize);
                y += qrSize + 84;
                ctx.fillStyle = INK;
                ctx.font = 'bold 44px ' + FONT;
                ctx.fillText(TEXT.url, W / 2, y);
                y += 50;
                ctx.fillStyle = '#9C8E7E';
                ctx.font = '28px ' + FONT;
                ctx.fillText(TEXT.note, W / 2, y);

                // Footer band.
                var fy = H - footH;
                ctx.fillStyle = INK;
                ctx.fillRect(0, fy, W, footH);
                y = fy + 56 + 18;
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 36px ' + FONT;
                contactLines.forEach(function (l) { ctx.fillText(l, W / 2, y); y += 48; });
                if (TEXT.address) {
                    ctx.fillStyle = '#D9CFC3';
                    ctx.font = '28px ' + FONT;
                    ctx.fillText(TEXT.address, W / 2, y);
                    y += 44;
                }
                y += 14;
                ctx.fillStyle = '#C56F3D';
                ctx.font = 'bold 24px ' + FONT;
                ctx.fillText(TEXT.thanks.split('').join(' '), W / 2, y);

                return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
            });
        }

        function download() {
            btn.disabled = true;
            makePng().then(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'complaint-qr-{{ \Illuminate\Support\Str::slug($siteName) }}.png';
                document.body.appendChild(a);
                a.click();
                setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); btn.disabled = false; }, 1500);
            }).catch(function () {
                btn.disabled = false;
                alert('Could not build the image here. Use Print and choose "Save as PDF" instead.');
            });
        }

        btn.addEventListener('click', download);
        // /complain/poster?download=1 — the admin's "Download QR image" button.
        if (new URLSearchParams(window.location.search).get('download') === '1') {
            load(codeImg.src).then(download);
        }
    })();
    </script>
</body>
</html>
