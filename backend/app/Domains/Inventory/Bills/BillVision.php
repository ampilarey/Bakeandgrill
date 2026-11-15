<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\NotFoundException;
use Anthropic\Core\Exceptions\PermissionDeniedException;
use Anthropic\Core\Exceptions\RateLimitException;
use Illuminate\Support\Facades\Log;

/**
 * Reads a supplier's bill (a photo, a scan or a PDF) and returns what is on it as plain
 * data. BillReader decides what to send and checks what comes back, and tests swap this
 * class out.
 *
 * Which service reads it is the owner's pick (BillReaderSettings, Purchasing → Settings →
 * Reading bills): Claude, read here through the official SDK, or Google Gemini
 * (GeminiVision). Both get the same instructions and must answer in the same SCHEMA.
 * With no key for the picked service `enabled()` is false and nothing is sent.
 */
class BillVision
{
    /** What Claude must answer with. Every field is always present; "" or 0 means not on the bill. */
    public const SCHEMA = [
        'type' => 'object',
        'additionalProperties' => false,
        'required' => ['is_bill', 'shop', 'bill_no', 'date', 'total', 'gst_total', 'note', 'lines'],
        'properties' => [
            'is_bill' => ['type' => 'boolean', 'description' => 'False when the picture is not a bill, invoice or receipt for goods, or nothing on it can be read.'],
            'shop' => ['type' => 'string', 'description' => 'Who sold the goods. The exact name from the suppliers on file when it is the same shop, else the name as printed.'],
            'bill_no' => ['type' => 'string', 'description' => 'The bill, invoice or receipt number, or "".'],
            'date' => ['type' => 'string', 'description' => 'The bill date as YYYY-MM-DD, or "" when it cannot be read.'],
            'total' => ['type' => 'number', 'description' => 'The grand total printed on the bill, GST included, or 0.'],
            'gst_total' => ['type' => 'number', 'description' => 'The GST amount printed on the bill, or 0.'],
            'note' => ['type' => 'string', 'description' => 'One short sentence for the person checking, only when something needs their eye (a torn corner, a line crossed out, a total that does not add up). Else "".'],
            'lines' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['name', 'item_id', 'new_name', 'new_unit', 'quantity', 'unit', 'unit_price', 'amount', 'gst', 'unsure'],
                    'properties' => [
                        'name' => ['type' => 'string', 'description' => 'The line as written on the bill.'],
                        'item_id' => ['type' => 'integer', 'description' => 'The id of the inventory item this line is, from the list, or 0 when none of them is this product.'],
                        'new_name' => ['type' => 'string', 'description' => 'When item_id is 0: a short, clean name for a new inventory item (no brand, no size unless the size is what tells it apart). Else "".'],
                        'new_unit' => ['type' => 'string', 'description' => 'When item_id is 0: the smallest unit it would be counted in on the shelf (piece, kg, litre, packet…). Else "".'],
                        'quantity' => ['type' => 'number', 'description' => 'How many were bought, in the unit below.'],
                        'unit' => ['type' => 'string', 'description' => '"" when the quantity is in the inventory item\'s own unit. Otherwise the name of one of that item\'s packs when the bill\'s unit is that pack, else the bill\'s own word in lower case (case, carton, box, tray, bag…).'],
                        'unit_price' => ['type' => 'number', 'description' => 'What one of that unit cost, as paid: after any discount on the line, GST included.'],
                        'amount' => ['type' => 'number', 'description' => 'The line total as paid, GST included.'],
                        'gst' => ['type' => 'boolean', 'description' => 'True when GST was charged on this line.'],
                        'unsure' => ['type' => 'boolean', 'description' => 'True when a figure or the product on this line was hard to read or is a guess.'],
                    ],
                ],
            ],
        ],
    ];

    public const INSTRUCTIONS = <<<'TXT'
        You read supplier bills for a restaurant in the Maldives so that staff do not have to type them. You are given one bill: a phone photo, a scan or a PDF. It may be a printed tax invoice, a till receipt or a handwritten cash bill, in English and sometimes partly in Dhivehi. Amounts are in Maldivian rufiyaa (MVR) unless the bill says otherwise.

        A person will check your reading against the bill before anything is saved, and stock and money records are made from it. So read what is there and never fill a gap with a likely value: a figure you cannot read is 0 with "unsure" true, and a product you cannot place gets item_id 0. A wrong match that looks confident costs them more than an honest blank.

        For each line of goods on the bill, in the bill's order:
        - Match it to one inventory item from the list when it is the same product, allowing for brand names, abbreviations, spelling and sizes ("C/COLA 500ML PET" is a cola item counted in bottles). Different products that merely share a word are not a match.
        - Give the quantity and the unit it was sold in. The inventory list shows each item's own unit and the packs already defined for it with how many of the own unit one pack holds. If the bill sells it in the item's own unit, leave "unit" empty. If it sells it in one of the listed packs, use that pack's name exactly. If it sells it in some other pack (a carton of 24 where no carton is defined), give the bill's word for it: the person will say how many it holds.
        - Give the price of one unit and the line total as actually paid. When the bill shows prices before GST and adds GST at the foot, add the GST into the unit price and the amount of the lines it applies to, so that the lines add up to the grand total. Apply a line discount to its line; spread a discount on the whole bill across the lines in proportion.
        - Leave out lines that are not goods: subtotals, totals, GST, rounding, change, payment and bottle deposits returned. A delivery or service charge is a line of its own with item_id 0.

        The shop is whoever issued the bill, never the restaurant it is addressed to (Bake & Grill). When the shop is clearly one of the suppliers on file, answer with that supplier's name exactly as listed.

        If the picture is not a bill for goods, or is too blurred to read at all, answer with is_bill false and no lines.
        TXT;

    public function __construct(private readonly BillReaderSettings $settings) {}

    public function enabled(): bool
    {
        return $this->settings->key($this->settings->provider()) !== '';
    }

    /**
     * @param string $bytes the file itself: a JPEG, PNG or WebP picture, or a PDF
     * @param string $mime its media type
     * @param string $context the inventory items and suppliers on file, as text
     * @param string|null $provider the service to ask, when not the picked one (the settings Test)
     * @return array<string, mixed> matching SCHEMA
     *
     * @throws BillUnreadable
     */
    public function read(string $bytes, string $mime, string $context, ?string $provider = null): array
    {
        $provider ??= $this->settings->provider();
        $key = $this->settings->key($provider);
        if ($key === '') {
            throw new BillUnreadable('Bill reading is not set up yet: add a key under Purchasing → Settings → Reading bills.');
        }
        $model = $this->settings->model($provider);

        return match ($provider) {
            'google' => app(GeminiVision::class)->read($bytes, $mime, $context, $key, $model),
            default => $this->readWithClaude($bytes, $mime, $context, $key, $model),
        };
    }

    /** @return array<string, mixed> */
    private function readWithClaude(string $bytes, string $mime, string $context, string $key, string $model): array
    {
        $base = trim((string) config('services.anthropic.base_url'));
        $client = new Client(apiKey: $key, baseUrl: $base !== '' ? $base : null);

        $file = $mime === 'application/pdf'
            ? ['type' => 'document', 'source' => ['type' => 'base64', 'mediaType' => 'application/pdf', 'data' => base64_encode($bytes)]]
            : ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $mime, 'data' => base64_encode($bytes)]];

        try {
            $message = $client->beta->messages->create(
                maxTokens: 16000,
                messages: [[
                    'role' => 'user',
                    'content' => [$file, ['type' => 'text', 'text' => 'Read this bill.']],
                ]],
                model: $model,
                // The instructions and the lists are the same for every bill in a pile, so
                // they are cached: the second bill on pays a tenth for them.
                system: [
                    ['type' => 'text', 'text' => self::INSTRUCTIONS],
                    ['type' => 'text', 'text' => $context, 'cacheControl' => ['type' => 'ephemeral']],
                ],
                outputConfig: [
                    'effort' => 'medium',
                    'format' => ['type' => 'json_schema', 'schema' => self::SCHEMA],
                ],
                // If the model declines a bill, the API tries its fallback model in the same call.
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
                requestOptions: ['timeout' => 150.0, 'maxRetries' => 1],
            );
        } catch (AuthenticationException|PermissionDeniedException $e) {
            Log::warning('Bill reading: the Claude key was refused', ['error' => $e->getMessage()]);
            throw new BillUnreadable('The Claude key was refused. Check the key and that the account has credit.');
        } catch (RateLimitException $e) {
            throw new BillUnreadable('The reader is busy just now. Try this bill again in a minute.', retry: true);
        } catch (NotFoundException $e) {
            throw new BillUnreadable("Claude does not know the model \"{$model}\". Clear the model box to use the usual one.");
        } catch (APIStatusException $e) {
            Log::warning('Bill reading failed', ['status' => $e->status ?? null, 'error' => $e->getMessage()]);
            $retry = ($e->status ?? 0) >= 500;
            throw new BillUnreadable(
                $retry ? 'The reader did not answer. Try this bill again in a minute.' : 'The reader could not take this file. Try a clearer photo, or type the bill.',
                retry: $retry,
            );
        } catch (APIConnectionException $e) {
            Log::warning('Bill reading: no connection', ['error' => $e->getMessage()]);
            throw new BillUnreadable('The reader could not be reached. Try this bill again in a minute.', retry: true);
        }

        if ($message->stopReason === 'refusal') {
            throw new BillUnreadable('The reader would not read this file. Type this bill by hand.');
        }
        if ($message->stopReason === 'max_tokens') {
            throw new BillUnreadable('This bill is too long to read in one go. Send it a page at a time.');
        }

        foreach ($message->content as $block) {
            if ($block->type === 'text') {
                $data = json_decode($block->text, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }

        throw new BillUnreadable('The reader gave no answer for this bill. Try it again.', retry: true);
    }
}
