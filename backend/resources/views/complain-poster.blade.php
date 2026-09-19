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
        .print { display: block; margin: 16px auto 0; min-height: 44px; padding: 0 20px; border: none; border-radius: 10px; background: #D4813A; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
        @media print {
            body { background: #fff; }
            .sheet { border: none; margin: 0; max-width: none; padding: 0; }
            .print { display: none; }
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
        <button type="button" class="print" data-print>Print</button>
    </div>
    <script nonce="{{ csp_nonce() }}">document.querySelector('[data-print]').addEventListener('click', function () { window.print(); });</script>
</body>
</html>
