<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Services\CateringQuoteApprovalService;
use App\Domains\Catering\Services\CateringQuoteService;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;

class EventQuoteController extends Controller
{
    public function __construct(
        private readonly CateringQuoteService $quotes,
        private readonly CateringQuoteApprovalService $approval,
    ) {}

    public function show(string $token): JsonResponse
    {
        if (strlen($token) < 32 || strlen($token) > 64) {
            return response()->json(['message' => 'Quote not found.'], 404);
        }

        $row = CateringRequest::query()
            ->with(['lines.packagingOption'])
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

        return response()->json(['quote' => $this->formatPublicQuote($row)]);
    }

    public function approve(string $token): JsonResponse
    {
        if (strlen($token) < 32 || strlen($token) > 64) {
            return response()->json(['message' => 'Quote not found.'], 404);
        }

        $result = $this->approval->approve($token);

        return response()->json([
            'payment_url' => $result['payment_url'],
            'payment_id' => $result['payment_id'],
            'order_number' => $result['order']->order_number,
            'reference' => $result['request']->reference,
            'quote_payment_laar' => (int) $result['request']->quote_payment_laar,
            'quote_is_deposit' => (bool) $result['request']->quote_is_deposit,
        ]);
    }

    /** @return array<string, mixed> */
    private function formatPublicQuote(CateringRequest $row): array
    {
        $tax = $this->quotes->taxPreview($row);

        return [
            'reference' => $row->reference,
            'status' => $row->status,
            'contact_name' => $row->contact_name,
            'event_type' => $row->event_type,
            'event_date' => $row->event_date?->toDateString(),
            'fulfillment_method' => $row->fulfillment_method ?? 'pickup',
            'fulfillment_time' => $row->fulfillment_time
                ? Carbon::parse($row->fulfillment_time)->format('H:i')
                : null,
            'setup_time' => $row->setup_time
                ? Carbon::parse($row->setup_time)->format('H:i')
                : null,
            'venue_name' => $row->venue_name,
            'delivery_address' => $row->delivery_address,
            'delivery_island' => $row->delivery_island,
            'onsite_contact_name' => $row->onsite_contact_name,
            'onsite_contact_phone' => $row->onsite_contact_phone,
            'headcount' => $row->headcount,
            'dietary_notes' => $row->dietary_notes,
            'quote_version' => (int) $row->quote_version,
            'quote_sent_at' => $row->quote_sent_at?->toIso8601String(),
            'quote_expires_at' => $row->quote_expires_at?->toIso8601String(),
            'quote_payment_laar' => $row->quote_payment_laar !== null ? (int) $row->quote_payment_laar : null,
            'quote_is_deposit' => (bool) $row->quote_is_deposit,
            'subtotal_laar' => $tax['subtotal_laar'],
            'tax_laar' => $tax['tax_laar'],
            'packaging_fee_laar' => $tax['packaging_fee_laar'] ?? 0,
            'packaging_fee_label' => $tax['packaging_fee_label'] ?? 'Packaging fee',
            'packaging_fee_taxable' => (bool) ($tax['packaging_fee_taxable'] ?? false),
            'total_laar' => $tax['total_laar'],
            'tax_inclusive' => $tax['tax_inclusive'],
            'lines' => $row->lines->map(fn ($l) => [
                'name' => $l->name,
                'quantity' => $l->quantity,
                'unit_price' => $l->unit_price !== null ? (float) $l->unit_price : null,
                'notes' => $l->notes,
                'is_custom' => (bool) $l->is_custom,
                'packaging_option_name' => $l->relationLoaded('packagingOption')
                    ? $l->packagingOption?->name
                    : null,
            ])->values()->all(),
        ];
    }
}
