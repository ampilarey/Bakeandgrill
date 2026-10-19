<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\GstSetting;

/** Shelf prices say when GST is added later, once per request. */
final class GstShelfNote
{
    public static function text(): string
    {
        // Once per request. A process-wide static would freeze the first
        // answer for every later test and every later page in the same worker.
        $request = request();
        $cached = $request->attributes->get('gst_shelf_note');
        if (is_string($cached)) {
            return $cached;
        }
        $gst = GstSetting::query()->first();
        $text = ($gst && $gst->gst_registered && !$gst->tax_inclusive)
            ? 'GST added at checkout'
            : '';
        $request->attributes->set('gst_shelf_note', $text);

        return $text;
    }
}
