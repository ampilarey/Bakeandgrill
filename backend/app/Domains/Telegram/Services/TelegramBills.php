<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Inventory\Bills\BillReader;
use App\Domains\Inventory\Bills\BillUnreadable;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramText;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Requests\StorePurchaseRequest;
use App\Models\PurchaseBill;
use App\Models\TelegramLink;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Supplier bills through the staff bot (owner, 2026-11-15: "Can I upload and approve
 * slip via Telegram").
 *
 * Send the bot a photo or a PDF of a bill: it is kept as a purchase_bills row like one
 * sent from Admin, read after the webhook has answered (the scheduler reads it if that
 * is cut short), and the reading comes back to the chat. BillReader::review() sorts what
 * is left to decide: a product not on file is added to the inventory at Approve (for
 * someone with `inventory.manage`), a pack with no size is defined from the bill or asked
 * for here, and only what truly needs the form (a figure hard to read, lines that do not
 * add up) sends the person to Admin. Approve makes the purchase through the one manual
 * path. Everything asks `suppliers.purchases`, on the photo and again on every button.
 */
class TelegramBills
{
    private const PERMISSION = 'suppliers.purchases';

    /** Adding a product to the inventory, as on the manual order's "Item not on the list". */
    private const ADD_ITEMS = 'inventory.manage';

    private const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    /** Telegram lets a bot fetch files up to 20 MB; a bill is far smaller. */
    private const MAX_BYTES = 10 * 1024 * 1024;

    public function __construct(
        private readonly TelegramClient $client,
        private readonly TelegramCommands $commands,
    ) {}

    /** @param array<string, mixed> $message Telegram's message, with a photo or a document */
    public function receive(TelegramLink $link, array $message): void
    {
        $user = $link->user;
        if ($user === null || !$this->commands->can($user, self::PERMISSION)) {
            $this->commands->send($link, 'A photo here is read as a supplier\'s bill, and your account cannot enter purchases.');

            return;
        }
        $reader = app(BillReader::class);
        if (!$reader->enabled()) {
            $this->commands->send($link, 'Reading bills is not set up yet. Add a key in Admin: Purchasing → Settings → Reading bills.');

            return;
        }

        // A photo comes in several sizes, the largest last; a document says what it is.
        $doc = is_array($message['document'] ?? null) ? $message['document'] : null;
        $photo = is_array($message['photo'] ?? null) ? end($message['photo']) : null;
        $fileId = (string) ($doc['file_id'] ?? $photo['file_id'] ?? '');
        $mime = $doc !== null ? (string) ($doc['mime_type'] ?? '') : 'image/jpeg';
        $size = (int) ($doc['file_size'] ?? $photo['file_size'] ?? 0);
        if ($fileId === '' || !in_array($mime, self::MIMES, true)) {
            $this->commands->send($link, 'Send the bill as a photo, or as a PDF, JPG or PNG file.');

            return;
        }
        if ($size > self::MAX_BYTES) {
            $this->commands->send($link, 'That file is over 10 MB. Send a photo of the bill instead.');

            return;
        }

        try {
            $file = $this->client->download($link->bot, $fileId);
            $bill = $reader->keep($file['bytes'], (string) ($doc['file_name'] ?? ('telegram-' . now()->format('Ymd-His') . '.jpg')), $mime, $user->id, $link->id);
        } catch (BillUnreadable $e) {
            $this->commands->send($link, TelegramText::e($e->getMessage()));

            return;
        } catch (TelegramApiException $e) {
            Log::warning('telegram: could not fetch a bill', ['error' => $e->getMessage()]);
            $this->commands->send($link, 'The file could not be fetched from Telegram. Send it again.');

            return;
        }

        $this->commands->send($link, '🧾 Got the bill. Reading it now: the result comes here in a moment.');
        // Reading takes several seconds and Telegram waits for the webhook's answer:
        // read once the answer has gone. Cut short, the scheduler reads it within minutes.
        $id = $bill->id;
        DeferAfterResponse::run(static function () use ($id): void {
            $bill = PurchaseBill::find($id);
            if ($bill !== null) {
                @set_time_limit(180);
                app(BillReader::class)->read($bill);
            }
        }, 'telegram bill read', always: true);
    }

    /** The reading goes back to the chat the bill came from. Once per reading. */
    public function tell(PurchaseBill $bill): void
    {
        if (!in_array($bill->status, [PurchaseBill::READY, PurchaseBill::FAILED], true)) {
            return;
        }
        $link = TelegramLink::query()->with(['bot', 'user.role'])->find($bill->telegram_link_id);
        if ($link === null || !$link->isUsable()) {
            return;
        }
        try {
            [$html, $buttons] = $this->card($bill, $link->user);
            $this->client->sendMessage($link->bot, $link->chat_id, $html, $buttons);
            $bill->forceFill(['telegram_told_at' => now()])->save();
        } catch (Throwable $e) {
            // The bill is still on the list in Admin; a lost message must not fail the reading.
            Log::warning('telegram: could not send a bill reading', ['bill' => $bill->id, 'error' => $e->getMessage()]);
        }
    }

    /**
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>|null}
     */
    public function card(PurchaseBill $bill, ?User $user = null): array
    {
        $reader = app(BillReader::class);
        $admin = rtrim((string) config('app.url'), '/') . '/admin/purchasing/orders?bills=1';
        $open = ['text' => 'Open in Admin', 'url' => $admin];
        $remove = ['text' => '🗑 Remove', 'callback_data' => 'pbr:' . $bill->id];

        if ($bill->status === PurchaseBill::FAILED) {
            return ["🧾 <b>This bill could not be read</b>\n" . TelegramText::e((string) $bill->error) . "\n\nSend a clearer photo, or type it in Admin.", [[$open, $remove]]];
        }

        // Laid out as the manual order's form is: who, when, each line with what it puts
        // on the shelf, the total against the bill's, then Did you pay? as the buttons.
        $data = $reader->present($bill)['data'];
        $money = fn (float $v): string => 'MVR ' . number_format($v, 2);
        $qty = fn (float $v): string => rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.');
        $e = fn (?string $v): string => TelegramText::e((string) $v);
        $date = $data['date'] ?? null;
        $lines = [
            '🧾 <b>Purchase order from a bill</b>',
            '',
            '<b>Bought from:</b> ' . ($data['shop'] !== '' ? $e($data['shop']) : '⚠ not read'),
            '<b>Purchase date:</b> ' . ($date !== null ? \Carbon\Carbon::parse($date)->format('D j M Y') : '⚠ not read'),
        ];
        if ($data['bill_no'] !== '') {
            $lines[] = '<b>Bill no.:</b> ' . $e($data['bill_no']);
        }
        $lines[] = '';
        $lines[] = '<b>Items (' . count($data['lines']) . ')</b>';
        foreach (array_slice($data['lines'], 0, 20) as $i => $line) {
            $known = $line['item'] !== null;
            $own = (string) ($line['item']['unit'] ?? $line['new_unit']);
            $unit = $line['unit'] !== '' ? $line['unit'] : $own;
            $in = $reader->unitsIn($line);
            $lines[] = '';
            $lines[] = '<b>' . ($i + 1) . '. ' . $e($known ? $line['item']['name'] : ($line['new_name'] !== '' ? $line['new_name'] : $line['name'])) . '</b>'
                . ($known ? '' : ' · 🆕 not in inventory') . (!empty($line['unsure']) ? ' · ⚠ check this line' : '');
            $lines[] = '   ' . $qty($line['quantity']) . ' ' . $e($unit) . ' × ' . $money($line['unit_price']) . ' = <b>' . $money($line['amount']) . '</b>'
                . ($line['gst'] ? ' · 8% GST inside' : '');
            if ($in === null) {
                $lines[] = '   Pack: how many ' . $e($own) . ' in one ' . $e($unit) . ' is not known yet';
            } elseif ($in != 1.0) {
                $units = $line['quantity'] * $in;
                $lines[] = '   Pack: 1 ' . $e($unit) . ' = ' . $qty($in) . ' ' . $e($own) . ', so ' . $qty($units) . ' ' . $e($own)
                    . ' at ' . $money($units > 0 ? $line['amount'] / $units : 0) . ' each';
            }
            if (mb_strtolower($line['name']) !== mb_strtolower((string) ($line['item']['name'] ?? ''))) {
                $lines[] = '   <i>On the bill: ' . $e(mb_strimwidth($line['name'], 0, 80, '…')) . '</i>';
            }
        }
        if (count($data['lines']) > 20) {
            $lines[] = '';
            $lines[] = '… and ' . (count($data['lines']) - 20) . ' more lines. Open it in Admin to see them all.';
        }
        $lines[] = '';
        $lines[] = '<b>Order total: ' . $money($data['lines_total']) . '</b>';
        if ($data['total'] > 0) {
            $lines[] = abs($data['total'] - $data['lines_total']) <= 0.05
                ? '✓ The same as the bill\'s total.'
                : '⚠ The bill\'s total is ' . $money($data['total']) . '.';
        }
        if ($data['gst_total'] > 0) {
            $lines[] = 'GST on the bill: ' . $money($data['gst_total']);
        }
        if (!empty($data['seen_before'])) {
            $lines[] = '⚠ A purchase with this bill number is already on file.';
        }
        if ($data['note'] !== '') {
            $lines[] = '<i>' . $e($data['note']) . '</i>';
        }

        $review = $reader->review($bill, $user !== null && $this->commands->can($user, self::ADD_ITEMS));
        if ($review['blocking'] !== []) {
            $lines[] = '';
            $lines[] = '<b>This one needs checking in Admin:</b>';
            foreach ($review['blocking'] as $reason) {
                $lines[] = '• ' . TelegramText::e($reason);
            }

            return [implode("\n", $lines), [[$open, $remove]]];
        }

        // What the bot settles itself, said before it is done.
        $unitOf = fn (array $line): string => (string) ($line['item']['unit'] ?? $line['new_unit']);
        $nameOf = fn (array $line): string => (string) ($line['item']['name'] ?? $line['new_name']);
        $adds = [];
        foreach ($review['new_items'] as $i) {
            $line = $data['lines'][$i];
            $adds[] = '• New item in your inventory: <b>' . TelegramText::e($line['new_name']) . '</b>, counted in ' . TelegramText::e($line['new_unit']);
        }
        foreach ($review['new_packs'] as $i) {
            $line = $data['lines'][$i];
            $adds[] = '• 1 ' . TelegramText::e($line['unit']) . ' of ' . TelegramText::e($nameOf($line)) . ' = ' . $qty((float) $line['pack_size']) . ' ' . TelegramText::e($unitOf($line));
        }

        // A pack whose size the bill does not give: asked for, one at a time.
        if ($review['ask_packs'] !== []) {
            $i = $review['ask_packs'][0];
            $line = $data['lines'][$i];
            $lines[] = '';
            $lines[] = 'Before this can be approved: how many ' . TelegramText::e($unitOf($line)) . ' are in one <b>' . TelegramText::e($line['unit']) . '</b> of ' . TelegramText::e($nameOf($line)) . '?';

            return [implode("\n", $lines), [
                [['text' => 'Say how many in one ' . $line['unit'], 'callback_data' => 'pbs:' . $bill->id . '.' . $i]],
                [$open, $remove],
            ]];
        }

        $lines[] = '';
        if ($adds !== []) {
            $lines[] = '<b>Approving also sets up:</b>';
            array_push($lines, ...$adds);
            $lines[] = '';
        }
        $lines[] = '<b>Did you pay?</b> Check it against the bill, then choose. Approving makes the purchase order as received, so the stock goes in.';
        $word = $adds !== [] ? '✅ Add and approve' : '✅ Approve';

        return [implode("\n", $lines), [
            [['text' => $word . ': paid in cash', 'callback_data' => 'pba:' . $bill->id]],
            [['text' => $word . ': not paid yet', 'callback_data' => 'pbn:' . $bill->id]],
            [$open, $remove],
        ]];
    }

    public function tap(TelegramLink $link, User $user, string $callbackId, int $messageId, string $action, string $arg): void
    {
        [$billId, $lineNo] = array_map('intval', array_pad(explode('.', $arg, 2), 2, '0'));
        $bot = $link->bot;
        if (!$this->commands->can($user, self::PERMISSION)) {
            $this->client->answerCallback($bot, $callbackId, 'Your account cannot enter purchases.', true);

            return;
        }
        $bill = PurchaseBill::query()->find($billId);
        if ($bill === null || !in_array($bill->status, PurchaseBill::WAITING, true)) {
            $this->client->answerCallback($bot, $callbackId, $bill?->status === PurchaseBill::DONE ? 'This bill was already entered.' : 'This bill is no longer on the list.', true);

            return;
        }

        if ($action === 'pbr') {
            Storage::disk('local')->delete($bill->file_path);
            $bill->delete();
            $this->client->answerCallback($bot, $callbackId, 'Removed.');
            $this->client->editMessage($bot, $link->chat_id, $messageId, '🗑 Bill removed. Nothing was entered from it.');

            return;
        }

        $reader = app(BillReader::class);
        $mayAdd = $this->commands->can($user, self::ADD_ITEMS);

        if ($action === 'pbs') {
            $line = $reader->present($bill)['data']['lines'][$lineNo] ?? null;
            if ($line === null) {
                $this->client->answerCallback($bot, $callbackId, 'That line is no longer on the bill.', true);

                return;
            }
            $this->client->answerCallback($bot, $callbackId);
            $this->commands->awaitReply($link, ['action' => 'bill_pack', 'bill' => $bill->id, 'line' => $lineNo]);
            $this->commands->send($link, 'How many ' . TelegramText::e((string) ($line['item']['unit'] ?? $line['new_unit'])) . ' are in one ' . TelegramText::e($line['unit']) . '? Send just the number, like 24.');

            return;
        }

        // Asked again at the press: an item may have been switched off since the card was sent.
        $review = $reader->review($bill, $mayAdd);
        if ($review['blocking'] !== [] || $review['ask_packs'] !== []) {
            $this->client->answerCallback($bot, $callbackId, $review['blocking'] !== [] ? 'This one needs checking in Admin: ' . $review['blocking'][0] : 'Say how many are in one pack first.', true);

            return;
        }
        // New products and packs first, then the bill is like any other.
        $reader->settle($bill, $review);
        $bill->refresh();
        if (!$reader->ready($reader->review($bill, $mayAdd))) {
            $this->client->answerCallback($bot, $callbackId, 'This one needs checking in Admin.', true);

            return;
        }

        try {
            $payload = Validator::make($reader->purchasePayload($bill, $action === 'pba'), (new StorePurchaseRequest)->rules(), (new StorePurchaseRequest)->messages())->validate();
            $purchase = app(PurchaseController::class)->createManual($payload, $this->commands->requestAs($user));
        } catch (ValidationException $e) {
            $this->client->answerCallback($bot, $callbackId, mb_substr((string) collect($e->errors())->flatten()->first(), 0, 180) . ' Open it in Admin.', true);

            return;
        }

        $this->client->answerCallback($bot, $callbackId, 'Purchase order made.');
        $this->client->editMessage($bot, $link->chat_id, $messageId, sprintf(
            "✅ <b>Purchase order %s made and received</b>\n%s · MVR %s · %s\nThe stock is in, and the bill is kept with the order as its receipt.",
            TelegramText::e((string) $purchase->purchase_number),
            TelegramText::e((string) ($purchase->supplier?->name ?? $purchase->supplier_name_text ?? '')),
            number_format((float) $purchase->total, 2),
            $action === 'pba' ? 'paid in cash' : 'not paid yet',
        ));
    }

    /**
     * The number typed after "Say how many in one …": kept on the bill, and the card
     * comes again, now with Approve (or the next pack to ask about).
     *
     * @param array<string, mixed> $await
     */
    public function answerAwait(TelegramLink $link, User $user, array $await, string $text): bool
    {
        if (($await['action'] ?? '') !== 'bill_pack') {
            return false;
        }
        $bill = PurchaseBill::query()->whereIn('status', PurchaseBill::WAITING)->find((int) ($await['bill'] ?? 0));
        if ($bill === null || !$this->commands->can($user, self::PERMISSION)) {
            $this->commands->send($link, 'That bill is no longer on the list.');

            return true;
        }
        $number = (float) str_replace(',', '', trim($text));
        if (!is_numeric(str_replace(',', '', trim($text))) || $number <= 0 || $number > 100000) {
            $this->commands->awaitReply($link, $await);
            $this->commands->send($link, 'Just the number, please, like 24.');

            return true;
        }
        app(BillReader::class)->setPackSize($bill, (int) ($await['line'] ?? -1), $number);
        [$html, $buttons] = $this->card($bill->refresh(), $user);
        $this->client->sendMessage($link->bot, $link->chat_id, $html, $buttons);

        return true;
    }
}
