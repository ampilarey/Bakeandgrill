<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Mail\EventQuoteSentMail;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\SpecialPricingService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CateringQuoteService
{
    public function __construct(
        private readonly SpecialPricingService $specialPricing,
        private readonly GstTaxCalculator $taxCalculator,
        private readonly GstSettingsService $gstSettings,
        private readonly SmsService $sms,
        private readonly CateringNotifyRecipients $recipients,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $lines
     */
    public function replaceLines(CateringRequest $request, array $lines, User $actor): CateringRequest
    {
        $resolved = $this->resolveStaffLines($lines);

        DB::transaction(function () use ($request, $resolved, $actor) {
            $request->lines()->delete();
            foreach ($resolved as $i => $line) {
                CateringRequestLine::create([
                    'catering_request_id' => $request->id,
                    'item_id' => $line['item_id'],
                    'variant_id' => $line['variant_id'],
                    'name' => $line['name'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'notes' => $line['notes'],
                    'is_custom' => $line['is_custom'],
                    'price_needs_review' => $line['price_needs_review'] ?? false,
                    'sort_order' => $i,
                ]);
            }

            $subtotalLaar = $this->computeSubtotalLaar($request->fresh()->lines);
            $updates = [
                'quote_subtotal_laar' => $subtotalLaar,
                'quoted_amount' => $subtotalLaar !== null ? round($subtotalLaar / 100, 2) : null,
            ];

            // Editing lines invalidates a live quote.
            if ($request->quote_token || $request->status === 'awaiting_customer') {
                $updates['quote_token'] = null;
                $updates['quote_sent_at'] = null;
                $updates['quote_expires_at'] = null;
                $updates['quote_payment_laar'] = null;
                $updates['quote_is_deposit'] = false;
                if ($request->status === 'awaiting_customer') {
                    $updates['status'] = 'quoted';
                }
            }

            if ($request->handled_by === null) {
                $updates['handled_by'] = $actor->id;
            }

            $old = $request->only(['quote_token', 'status', 'handled_by', 'quote_subtotal_laar']);
            $request->update($updates);
            $this->audit->log(
                'catering.lines_replaced',
                'CateringRequest',
                $request->id,
                $old,
                $request->fresh()->only(['quote_token', 'status', 'handled_by', 'quote_subtotal_laar']),
                ['line_count' => count($resolved)],
            );
        });

        return $request->fresh(['lines', 'handler']);
    }

    /**
     * @param  array{payment_amount_mvr: float|int|string, is_deposit?: bool}  $payload
     */
    public function sendQuote(CateringRequest $request, array $payload, User $actor): CateringRequest
    {
        $request->load('lines');
        $this->assertSendable($request);

        $subtotalLaar = $this->computeSubtotalLaar($request->lines);
        if ($subtotalLaar === null || $subtotalLaar <= 0) {
            throw ValidationException::withMessages([
                'lines' => ['Quote has no priced lines.'],
            ]);
        }

        $taxPreview = $this->taxPreview($request);
        $totalLaar = (int) $taxPreview['total_laar'];
        $paymentMvr = (float) $payload['payment_amount_mvr'];
        $paymentLaar = (int) round($paymentMvr * 100);
        $isDeposit = (bool) ($payload['is_deposit'] ?? false);

        if ($paymentLaar <= 0) {
            throw ValidationException::withMessages([
                'payment_amount_mvr' => ['Payment amount must be greater than zero.'],
            ]);
        }

        if ($isDeposit) {
            if ($paymentLaar > $totalLaar) {
                throw ValidationException::withMessages([
                    'payment_amount_mvr' => ['Deposit cannot exceed the quote total.'],
                ]);
            }
        } elseif ($paymentLaar !== $totalLaar) {
            throw ValidationException::withMessages([
                'payment_amount_mvr' => ['Full payment must equal the quote total (MVR ' . number_format($totalLaar / 100, 2) . ').'],
            ]);
        }

        $expiresAt = $this->computeExpiry($request);
        // First send keeps version (≥1); each resend increments.
        $version = $request->quote_token === null
            ? max(1, (int) $request->quote_version)
            : (int) $request->quote_version + 1;

        $token = Str::random(48);
        $old = $request->only(['quote_token', 'status', 'handled_by', 'quote_version']);

        $request->update([
            'quote_token' => $token,
            'quote_sent_at' => now(),
            'quote_expires_at' => $expiresAt,
            'quote_payment_laar' => $paymentLaar,
            'quote_is_deposit' => $isDeposit,
            'quote_version' => $version,
            'quote_subtotal_laar' => $subtotalLaar,
            'quoted_amount' => round($totalLaar / 100, 2),
            'status' => 'awaiting_customer',
            'quoted_at' => $request->quoted_at ?? now(),
            'handled_by' => $request->handled_by ?? $actor->id,
        ]);

        $request = $request->fresh(['lines', 'handler']);

        $this->audit->log(
            'catering.quote_sent',
            'CateringRequest',
            $request->id,
            $old,
            $request->only(['quote_token', 'status', 'handled_by', 'quote_version', 'quote_payment_laar', 'quote_expires_at']),
            ['is_deposit' => $isDeposit],
        );

        $this->notifyQuoteSent($request);

        return $request;
    }

    public function duplicate(CateringRequest $source, User $actor): CateringRequest
    {
        $source->load('lines');

        $copy = DB::transaction(function () use ($source) {
            $row = CateringRequest::create([
                'customer_id' => $source->customer_id,
                'reference' => CateringRequest::generateReference(),
                'company' => $source->company,
                'occasion' => $source->occasion,
                'event_type' => $source->event_type,
                'contact_name' => $source->contact_name,
                'phone' => $source->phone,
                'email' => $source->email,
                'event_date' => null,
                'fulfillment_method' => $source->fulfillment_method ?? 'pickup',
                'fulfillment_time' => null,
                'setup_time' => null,
                'venue_name' => $source->venue_name,
                'delivery_address' => $source->delivery_address,
                'delivery_island' => $source->delivery_island,
                'onsite_contact_name' => $source->onsite_contact_name,
                'onsite_contact_phone' => $source->onsite_contact_phone,
                'headcount' => $source->headcount,
                'notes' => $source->notes,
                'dietary_notes' => $source->dietary_notes,
                'fulfillment_options' => $source->fulfillment_options,
                'staff_notes' => null,
                'status' => 'draft',
                'source' => 'duplicate',
                'handled_by' => null,
                'quote_token' => null,
                'quote_version' => 1,
                'quote_is_deposit' => false,
            ]);

            foreach ($source->lines as $i => $line) {
                if ($line->is_custom) {
                    CateringRequestLine::create([
                        'catering_request_id' => $row->id,
                        'item_id' => null,
                        'variant_id' => null,
                        'name' => $line->name,
                        'quantity' => $line->quantity,
                        'unit_price' => $line->unit_price,
                        'notes' => $line->notes,
                        'is_custom' => true,
                        'price_needs_review' => $line->unit_price !== null,
                        'sort_order' => $i,
                    ]);
                    continue;
                }

                $item = $line->item_id ? Item::query()->with('variants')->find($line->item_id) : null;
                if (!$item || !$item->is_active) {
                    // Fall back to custom line with historical name/price for review.
                    CateringRequestLine::create([
                        'catering_request_id' => $row->id,
                        'item_id' => null,
                        'variant_id' => null,
                        'name' => $line->name,
                        'quantity' => $line->quantity,
                        'unit_price' => $line->unit_price,
                        'notes' => $line->notes,
                        'is_custom' => true,
                        'price_needs_review' => true,
                        'sort_order' => $i,
                    ]);
                    continue;
                }

                $variant = null;
                if ($line->variant_id) {
                    $variant = Variant::query()
                        ->where('id', $line->variant_id)
                        ->where('item_id', $item->id)
                        ->where('is_active', true)
                        ->first();
                }
                $catalogPrice = $variant ? (float) $variant->price : (float) $item->base_price;
                $pricing = $this->specialPricing->resolveUnitPrice($item->id, $catalogPrice, $item, $variant?->id);
                $name = $item->name . ($variant ? (' — ' . $variant->name) : '');

                CateringRequestLine::create([
                    'catering_request_id' => $row->id,
                    'item_id' => $item->id,
                    'variant_id' => $variant?->id,
                    'name' => mb_substr($name, 0, 160),
                    'quantity' => $line->quantity,
                    'unit_price' => round($pricing->unitPrice, 2),
                    'notes' => $line->notes,
                    'is_custom' => false,
                    'price_needs_review' => false,
                    'sort_order' => $i,
                ]);
            }

            $fresh = $row->fresh('lines');
            $subtotalLaar = $this->computeSubtotalLaar($fresh->lines);
            $fresh->update([
                'quote_subtotal_laar' => $subtotalLaar,
                'quoted_amount' => $subtotalLaar !== null ? round($subtotalLaar / 100, 2) : null,
            ]);

            return $fresh->fresh(['lines']);
        });

        $this->audit->log(
            'catering.duplicated',
            'CateringRequest',
            $copy->id,
            [],
            ['reference' => $copy->reference, 'source_id' => $source->id],
            ['duplicated_from' => $source->id, 'actor_id' => $actor->id],
        );

        return $copy;
    }

    /** @return array{subtotal_laar: int, tax_laar: int, total_laar: int, tax_inclusive: bool, lines: list<array<string,mixed>>} */
    public function taxPreview(CateringRequest $request): array
    {
        $request->loadMissing('lines.item');
        $taxInclusive = $this->gstSettings->taxInclusive();
        $subtotalLaar = 0;
        $taxLaar = 0;
        $lineRows = [];

        foreach ($request->lines as $line) {
            if ($line->unit_price === null) {
                $lineRows[] = [
                    'id' => $line->id,
                    'name' => $line->name,
                    'quantity' => $line->quantity,
                    'unit_price' => null,
                    'line_laar' => null,
                    'tax_laar' => null,
                    'is_custom' => (bool) $line->is_custom,
                    'unpriced' => true,
                ];
                continue;
            }
            $unitLaar = (int) round((float) $line->unit_price * 100);
            $lineTotal = $unitLaar * (int) $line->quantity;
            $taxCode = $line->item?->tax_code ?? null;
            $lineTax = $this->taxCalculator->calculateLineTaxLaar($lineTotal, $taxCode, $taxInclusive);
            $subtotalLaar += $lineTotal;
            $taxLaar += $lineTax;
            $lineRows[] = [
                'id' => $line->id,
                'name' => $line->name,
                'quantity' => $line->quantity,
                'unit_price' => (float) $line->unit_price,
                'line_laar' => $lineTotal,
                'tax_laar' => $lineTax,
                'is_custom' => (bool) $line->is_custom,
                'unpriced' => false,
            ];
        }

        $totalLaar = $taxInclusive ? $subtotalLaar : $subtotalLaar + $taxLaar;

        return [
            'subtotal_laar' => $subtotalLaar,
            'tax_laar' => $taxLaar,
            'total_laar' => $totalLaar,
            'tax_inclusive' => $taxInclusive,
            'lines' => $lineRows,
        ];
    }

    public function computeExpiry(CateringRequest $request): Carbon
    {
        $validDays = max(1, (int) SiteSetting::get('catering_quote_valid_days', '7'));
        $minHours = max(0, (int) SiteSetting::get('catering_quote_min_hours_before_event', '24'));

        $byDays = now()->addDays($validDays);
        $byEvent = $request->event_date
            ? Carbon::parse($request->event_date->toDateString() . ' 00:00:00')->subHours($minHours)
            : $byDays;

        $expires = $byDays->lt($byEvent) ? $byDays : $byEvent;
        if ($expires->lte(now())) {
            // Ensure a minimal future window so send isn't immediately expired.
            $expires = now()->addHour();
        }

        return $expires;
    }

    private function assertSendable(CateringRequest $request): void
    {
        if ($request->lines->isEmpty()) {
            throw ValidationException::withMessages(['lines' => ['Add at least one line before sending a quote.']]);
        }
        foreach ($request->lines as $line) {
            if ($line->is_custom && $line->unit_price === null) {
                throw ValidationException::withMessages([
                    'lines' => ['All custom lines must be priced before sending a quote.'],
                ]);
            }
            if (!$line->is_custom && $line->unit_price === null) {
                throw ValidationException::withMessages([
                    'lines' => ['All catalog lines must have a unit price before sending.'],
                ]);
            }
        }
        if (($request->fulfillment_method ?? 'pickup') === 'delivery') {
            if (blank($request->delivery_address) || blank($request->delivery_island)) {
                throw ValidationException::withMessages([
                    'delivery_address' => ['Delivery address and island are required before sending.'],
                ]);
            }
        }
        if (!$request->event_date) {
            throw ValidationException::withMessages([
                'event_date' => ['Event date is required before sending a quote.'],
            ]);
        }
    }

    /**
     * @param  \Illuminate\Support\Collection<int, CateringRequestLine>|iterable<CateringRequestLine>  $lines
     */
    public function computeSubtotalLaar(iterable $lines): ?int
    {
        $sum = 0;
        $any = false;
        foreach ($lines as $line) {
            if ($line->unit_price === null) {
                return null;
            }
            $any = true;
            $sum += (int) round((float) $line->unit_price * 100) * (int) $line->quantity;
        }

        return $any ? $sum : null;
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{item_id:?int,variant_id:?int,name:string,quantity:int,unit_price:?float,notes:?string,is_custom:bool,price_needs_review:bool}>
     */
    private function resolveStaffLines(array $lines): array
    {
        $out = [];
        foreach ($lines as $i => $line) {
            $qty = (int) ($line['quantity'] ?? 0);
            if ($qty < 1) {
                throw ValidationException::withMessages(["lines.{$i}.quantity" => ['Quantity must be at least 1.']]);
            }
            $notes = isset($line['notes']) ? (string) $line['notes'] : null;
            $isCustom = (bool) ($line['is_custom'] ?? false) || !empty($line['custom_name']) || empty($line['item_id']);

            if ($isCustom) {
                $name = trim((string) ($line['custom_name'] ?? $line['name'] ?? ''));
                if ($name === '') {
                    throw ValidationException::withMessages(["lines.{$i}.custom_name" => ['Custom line needs a name.']]);
                }
                $price = array_key_exists('unit_price', $line) && $line['unit_price'] !== null
                    ? round((float) $line['unit_price'], 2)
                    : null;
                if ($price !== null && $price < 0) {
                    throw ValidationException::withMessages(["lines.{$i}.unit_price" => ['Unit price must be ≥ 0.']]);
                }
                $out[] = [
                    'item_id' => null,
                    'variant_id' => null,
                    'name' => mb_substr($name, 0, 160),
                    'quantity' => $qty,
                    'unit_price' => $price,
                    'notes' => $notes,
                    'is_custom' => true,
                    'price_needs_review' => (bool) ($line['price_needs_review'] ?? false),
                ];
                continue;
            }

            $itemId = (int) $line['item_id'];
            $item = Item::query()->with('variants')->find($itemId);
            if (!$item || !$item->is_active) {
                throw ValidationException::withMessages(["lines.{$i}.item_id" => ['Item is not available.']]);
            }
            $variantId = isset($line['variant_id']) ? (int) $line['variant_id'] : null;
            $variant = null;
            if ($variantId) {
                $variant = Variant::query()
                    ->where('id', $variantId)
                    ->where('item_id', $item->id)
                    ->where('is_active', true)
                    ->first();
                if (!$variant) {
                    throw ValidationException::withMessages(["lines.{$i}.variant_id" => ['Variant not available.']]);
                }
            } elseif ($item->has_variants) {
                throw ValidationException::withMessages(["lines.{$i}.variant_id" => ['Variant required.']]);
            }

            // Catalog prices always re-resolved server-side — client unit_price ignored.
            $catalogPrice = $variant ? (float) $variant->price : (float) $item->base_price;
            $pricing = $this->specialPricing->resolveUnitPrice($item->id, $catalogPrice, $item, $variant?->id);
            $name = $item->name . ($variant ? (' — ' . $variant->name) : '');

            $out[] = [
                'item_id' => $item->id,
                'variant_id' => $variant?->id,
                'name' => mb_substr($name, 0, 160),
                'quantity' => $qty,
                'unit_price' => round($pricing->unitPrice, 2),
                'notes' => $notes,
                'is_custom' => false,
                'price_needs_review' => false,
            ];
        }

        if ($out === []) {
            throw ValidationException::withMessages(['lines' => ['Provide at least one line.']]);
        }

        return $out;
    }

    private function notifyQuoteSent(CateringRequest $request): void
    {
        $ref = $request->reference ?? ('#' . $request->id);
        $version = (int) $request->quote_version;
        $baseKey = 'event:' . $request->id . ':' . $version . ':quote_sent';
        $link = rtrim((string) config('app.url'), '/') . '/order/quote/' . $request->quote_token;
        $payMvr = number_format(((int) $request->quote_payment_laar) / 100, 2);
        $depositBit = $request->quote_is_deposit ? ' (deposit)' : '';

        $customerMsg = "Quote {$ref} ready — pay MVR {$payMvr}{$depositBit}: {$link}";
        if (trim((string) $request->phone) !== '') {
            $this->sms->send(new SmsMessage(
                to: (string) $request->phone,
                message: $customerMsg,
                type: 'transactional',
                customerId: $request->customer_id,
                referenceType: 'catering_request',
                referenceId: (string) $request->id,
                idempotencyKey: $baseKey . ':customer_sms',
            ));
        }

        $email = trim((string) ($request->email ?? ''));
        if ($email !== '') {
            try {
                Mail::to($email)->send(new EventQuoteSentMail($request, $link, $this->taxPreview($request)));
            } catch (\Throwable $e) {
                Log::warning('CateringQuoteService: customer quote email failed', [
                    'id' => $request->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $staffMsg = "Quote v{$version} sent for {$ref}";
        foreach ($this->recipients->forLifecycle($request) as $i => $target) {
            if (!empty($target['phone'])) {
                $this->sms->send(new SmsMessage(
                    to: (string) $target['phone'],
                    message: $staffMsg,
                    type: 'transactional',
                    referenceType: 'catering_request',
                    referenceId: (string) $request->id,
                    idempotencyKey: $baseKey . ':staff_sms:' . $i,
                ));
            }
            if (!empty($target['email'])) {
                try {
                    Mail::raw($staffMsg . "\n" . $link, function ($message) use ($target, $ref, $version) {
                        $message->to((string) $target['email'])
                            ->subject("Quote v{$version} sent — {$ref}");
                    });
                } catch (\Throwable $e) {
                    Log::warning('CateringQuoteService: staff quote email failed', [
                        'id' => $request->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }
    }
}
