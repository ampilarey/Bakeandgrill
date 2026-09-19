<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\ComplaintBoxEntry;
use App\Support\QrSvg;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * The public complaint form and the poster that points at it.
 *
 * Owner, 2026-09-19: an easy way for customers to complain about staff or
 * food, anonymously or with a mobile number, separate from the receipt.
 */
class ComplaintBoxPageController extends Controller
{
    public function show(Request $request): View
    {
        $orderRef = trim((string) $request->query('order', ''));
        $source = in_array($request->query('from'), ['receipt', 'poster'], true) ? (string) $request->query('from') : 'web';

        return view('complain', [
            'categories' => ComplaintBoxEntry::categoryOptions(),
            'staffCategories' => ComplaintBoxEntry::STAFF_CATEGORIES,
            'maxCategories' => ComplaintBoxEntry::MAX_CATEGORIES,
            'orderRef' => mb_substr($orderRef, 0, 40),
            'source' => $source,
            'endpoint' => url('/api/complaint-box'),
        ]);
    }

    /**
     * A printable A5 card with the QR, for the counter and the tables.
     *
     * Owner, 2026-09-19: "Qr code should be of live site, and add logo". The
     * address comes from the Business Website setting, not from whichever
     * host the poster happens to be opened on — a poster printed from the
     * TEST site or a laptop must still send customers to bakeandgrill.mv.
     */
    public function poster(): View
    {
        $base = rtrim((string) (safe_public_url((string) content('business_website', 'https://bakeandgrill.mv')) ?? 'https://bakeandgrill.mv'), '/');
        $url = $base . '/complain?from=poster';

        return view('complain-poster', [
            'url' => $url,
            'qr' => QrSvg::dataUri($url, 480, withLogoSpace: true),
            'logo' => $this->logoSrc(),
            'siteName' => (string) content('site_name', 'Bake & Grill'),
        ]);
    }

    /**
     * The logo embedded in the page rather than linked, so "Save as PDF" and
     * a print from a phone carry it whatever the network is doing. Falls
     * back to the address when the file is not on this server.
     */
    private function logoSrc(): string
    {
        // A blank CMS value comes back as '', not as the default.
        $url = trim((string) content('logo', ''));
        if ($url === '') {
            $url = asset('logo.png');
        }
        $path = (string) (parse_url($url, PHP_URL_PATH) ?: '');
        $local = public_path(ltrim($path, '/'));
        if ($path !== '' && is_file($local) && preg_match('/\.(png|jpe?g|webp|svg)$/i', $local)) {
            $mime = str_ends_with(strtolower($local), '.svg') ? 'image/svg+xml' : (mime_content_type($local) ?: 'image/png');
            $bytes = file_get_contents($local);
            if ($bytes !== false) {
                return 'data:' . $mime . ';base64,' . base64_encode($bytes);
            }
        }

        return $url;
    }
}
