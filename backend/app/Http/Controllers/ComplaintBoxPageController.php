<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\ComplaintBoxEntry;
use App\Support\ComplaintBoxLink;
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
        $source = in_array($request->query('from'), ComplaintBoxEntry::SOURCES, true) ? (string) $request->query('from') : 'web';

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
     * Owner, 2026-09-19: "Qr code should be of live site, and add logo", then
     * "remove the logo from the top and make the logo inside the qr code
     * bigger". The address and the logo come from ComplaintBoxLink so the
     * receipt carries the same code.
     */
    public function poster(): View
    {
        $url = ComplaintBoxLink::url('poster');

        return view('complain-poster', [
            'url' => $url,
            // A third of the width, as it has been on the wall since
            // 2026-09-19 ("make the logo inside the qr code bigger") — the
            // mark is inside the code's SVG now rather than laid over it.
            'qr' => ComplaintBoxLink::qr($url, 480, 0.33),
            'siteName' => (string) content('site_name', 'Bake & Grill'),
            // Owner, 2026-10-03: "enhance the complaint QR print layout with
            // branding, like a header or footer". The header carries the logo,
            // name and tagline; the footer how else to reach the business.
            'logo' => ComplaintBoxLink::logo(),
            'tagline' => trim((string) content('site_tagline', '')),
            'contacts' => self::posterContacts(),
        ]);
    }

    /**
     * The footer line: phone, website and Instagram, whichever are set, then
     * the address. Empty entries are left out so a half-filled profile
     * prints a short line rather than labels with nothing after them.
     *
     * @return array{line: list<string>, address: string}
     */
    private static function posterContacts(): array
    {
        $line = [];
        $phone = trim((string) content('business_phone', ''));
        if ($phone !== '') {
            $line[] = $phone;
        }
        $site = trim((string) content('business_website', ''));
        if ($site === '') {
            $site = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        }
        $site = preg_replace('#^https?://(www\.)?#i', '', rtrim($site, '/')) ?? '';
        if ($site !== '') {
            $line[] = $site;
        }
        $instagram = trim((string) content('social_instagram', ''));
        if ($instagram !== '') {
            // Stored as a URL ("https://instagram.com/bakeandgrill/"); printed as a handle.
            $handle = trim((string) (parse_url($instagram, PHP_URL_PATH) ?: $instagram), '/@ ');
            $handle = explode('/', $handle)[0] ?? '';
            if ($handle !== '' && !str_contains($handle, '.')) {
                $line[] = '@' . $handle;
            }
        }

        $address = implode(', ', array_filter([
            trim((string) content('business_address_line1', '')),
            trim((string) content('business_address_city', '')),
        ], fn (string $s) => $s !== ''));
        if ($address === '') {
            $address = trim((string) content('business_address', ''));
        }

        return ['line' => $line, 'address' => $address];
    }
}
