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

    /** A printable A5 card with the QR, for the counter and the tables. */
    public function poster(): View
    {
        $url = url('/complain?from=poster');

        return view('complain-poster', [
            'url' => $url,
            'qr' => QrSvg::dataUri($url, 480),
        ]);
    }
}
