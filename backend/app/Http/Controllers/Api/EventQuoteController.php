<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Services\CateringQuoteService;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use Illuminate\Http\JsonResponse;

class EventQuoteController extends Controller
{
    public function __construct(
        private readonly CateringQuoteService $quotes,
    ) {}

    public function show(string $token): JsonResponse
    {
        if (strlen($token) < 32 || strlen($token) > 64) {
            return response()->json(['message' => 'Quote not found.'], 404);
        }

        $row = CateringRequest::query()
            ->with('lines')
            ->where('quote_token', $token)
            ->first();

        if (!$row) {
            return response()->json(['message' => 'Quote not found.'], 404);
        }

        if ($row->quote_expires_at && $row->quote_expires_at->isPast()) {
            return response()->json([
                'message' => 'This quote has expired.',
                'expired' => true,
                'reference' => $row->reference,
                'quote_expires_at' => $row->quote_expires_at->toIso8601String(),
                'status' => $row->status,
            ], 410);
        }

        $tax = $this->quotes->taxPreview($row);

        return response()->json([
            'quote' => [
                'reference' => $row->reference,
                'status' => $row->status,
                'contact_name' => $row->contact_name,
                'event_type' => $row->event_type,
                'event_date' => $row->event_date?->toDateString(),
                'fulfillment_method' => $row->fulfillment_method ?? 'pickup',
                'fulfillment_time' => $row->fulfillment_time
                    ? \Illuminate\Support\Carbon::parse($row->fulfillment_time)->format('H:i')
                    : null,
                'venue_name' => $row->venue_name,
                'headcount' => $row->headcount,
                'dietary_notes' => $row->dietary_notes,
                'quote_version' => (int) $row->quote_version,
                'quote_sent_at' => $row->quote_sent_at?->toIso8601String(),
                'quote_expires_at' => $row->quote_expires_at?->toIso8601String(),
                'quote_payment_laar' => $row->quote_payment_laar !== null ? (int) $row->quote_payment_laar : null,
                'quote_is_deposit' => (bool) $row->quote_is_deposit,
                'subtotal_laar' => $tax['subtotal_laar'],
                'tax_laar' => $tax['tax_laar'],
                'total_laar' => $tax['total_laar'],
                'tax_inclusive' => $tax['tax_inclusive'],
                'lines' => $row->lines->map(fn ($l) => [
                    'name' => $l->name,
                    'quantity' => $l->quantity,
                    'unit_price' => $l->unit_price !== null ? (float) $l->unit_price : null,
                    'notes' => $l->notes,
                    'is_custom' => (bool) $l->is_custom,
                ])->values()->all(),
            ],
        ]);
    }
}
