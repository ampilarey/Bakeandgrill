<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Complaint box poster – {{ $siteName }}</title>
    <style>
        @page { size: A5; margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", sans-serif; color: #1C1408; background: #F8F6F3; }
        .sheet { max-width: 440px; margin: 24px auto; background: #fff; border: 1px solid #E8E0D8; border-radius: 20px; padding: 32px 28px 24px; text-align: center; }
        .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #D4813A; margin: 0 0 8px; }
        h1 { font-size: 30px; letter-spacing: -0.03em; margin: 0 0 8px; line-height: 1.1; }
        p { color: #6B5D4F; font-size: 15px; line-height: 1.5; margin: 0 0 18px; }
        .qr { position: relative; width: 260px; height: 260px; margin: 0 auto 14px; }
        .qr img.code { width: 260px; height: 260px; display: block; }
        /* The logo sits on a white pad in the middle, about a third of the
           width; the code is generated with the highest error correction so
           it still scans around it (checked by decoding a screenshot). */
        .qr img.mark { position: absolute; left: 50%; top: 50%; width: 96px; height: 96px; transform: translate(-50%, -50%); background: #fff; padding: 6px; border-radius: 16px; object-fit: contain; }
        .url { font-weight: 700; font-size: 18px; color: #1C1408; word-break: break-all; margin-bottom: 6px; }
        .small { font-size: 12px; color: #9C8E7E; }
        .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
        .print, .download { min-height: 44px; padding: 0 20px; border: none; border-radius: 10px; background: #D4813A; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
        .download { background: #fff; color: #1C1408; border: 1.5px solid #E8E0D8; }
        .hint { font-size: 12px; color: #9C8E7E; margin-top: 10px; }
        @media print {
            body { background: #fff; }
            .sheet { border: none; margin: 0; max-width: none; padding: 0; }
            .actions, .hint { display: none; }
            .qr, .qr img.code { width: 300px; height: 300px; }
            .qr img.mark { width: 110px; height: 110px; }
        }
    </style>
</head>
<body>
    <div class="sheet">
        <p class="eyebrow">{{ $siteName }}</p>
        <h1>Not happy? Tell the owner.</h1>
        <p>Staff, food, service, cleanliness — scan and tell us. Anonymous if you like, or leave your number and we will message you back.</p>
        <div class="qr" data-testid="poster-qr">
            <img class="code" src="{{ $qr }}" alt="QR code to the complaint form">
            <img class="mark" src="{{ $logo }}" alt="">
        </div>
        <div class="url">{{ preg_replace('#^https?://#', '', preg_replace('#\?.*$#', '', $url)) }}</div>
        <div class="small">Goes straight to the owner's phone.</div>
        <div class="actions">
            <button type="button" class="print" data-print>Print this card</button>
            <button type="button" class="download" data-download>Download QR image</button>
        </div>
        <p class="hint">The image is a 1200 px PNG of the code with the logo — send it to a print shop, or drop it into your own poster.</p>
    </div>
    {{-- Owner, 2026-09-19: "where i can download the qr code to past in the
         wall". The SVG code and the logo are both data: URIs on this page, so
         the browser can draw them on a canvas and hand back a PNG without a
         round trip and without tainting the canvas. --}}
    <script nonce="{{ csp_nonce() }}">
    (function () {
        document.querySelector('[data-print]').addEventListener('click', function () { window.print(); });

        var codeImg = document.querySelector('.qr img.code');
        var markImg = document.querySelector('.qr img.mark');
        var btn = document.querySelector('[data-download]');

        function load(src) {
            return new Promise(function (resolve, reject) {
                var img = new Image();
                img.onload = function () { resolve(img); };
                img.onerror = reject;
                img.src = src;
            });
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function makePng() {
            var size = 1200;
            var quiet = 60; // white margin all round, which scanners want
            var canvas = document.createElement('canvas');
            canvas.width = size + quiet * 2;
            canvas.height = size + quiet * 2;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return load(codeImg.src).then(function (qr) {
                ctx.drawImage(qr, quiet, quiet, size, size);
                return load(markImg.src);
            }).then(function (logo) {
                // Same proportions as on screen: logo about a third of the code
                // on a white pad, which the high error correction allows for.
                var l = Math.round(size * 0.33);
                var pad = Math.round(size * 0.025);
                var x = quiet + (size - l) / 2;
                var y = quiet + (size - l) / 2;
                ctx.fillStyle = '#fff';
                roundRect(ctx, x - pad, y - pad, l + pad * 2, l + pad * 2, Math.round(l * 0.16));
                ctx.fill();
                ctx.save();
                roundRect(ctx, x, y, l, l, Math.round(l * 0.14));
                ctx.clip();
                ctx.drawImage(logo, x, y, l, l);
                ctx.restore();
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
            Promise.all([load(codeImg.src), load(markImg.src)]).then(download);
        }
    })();
    </script>
</body>
</html>
