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
 * is cut short), and the reading comes back to the chat. When nothing on it needs a
 * person (BillReader::needsAPerson) the card carries Approve, which makes the purchase
 * through the one manual path; otherwise it says what needs a look and links to Admin.
 * Everything asks `suppliers.purchases`, on the photo and again on every button.
 */
class TelegramBills
{
    private const PERMISSION = 'suppliers.purchases';

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
            [$html, $buttons] = $this->card($bill);
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
    public function card(PurchaseBill $bill): array
    {
        $reader = app(BillReader::class);
        $admin = rtrim((string) config('app.url'), '/') . '/admin/purchasing/orders?bills=1';
        $open = ['text' => 'Open in Admin', 'url' => $admin];
        $remove = ['text' => '🗑 Remove', 'callback_data' => 'pbr:' . $bill->id];

        if ($bill->status === PurchaseBill::FAILED) {
            return ["🧾 <b>This bill could not be read</b>\n" . TelegramText::e((string) $bill->error) . "\n\nSend a clearer photo, or type it in Admin.", [[$open, $remove]]];
        }

        $data = $reader->present($bill)['data'];
        $money = fn (float $v): string => 'MVR ' . number_format($v, 2);
        $qty = fn (float $v): string => rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.');
        $lines = ['🧾 <b>' . TelegramText::e($data['shop'] !== '' ? $data['shop'] : 'A bill') . '</b>'];
        $lines[] = implode(' · ', array_filter([
            $data['date'] ?? 'no date read',
            $data['bill_no'] !== '' ? 'no. ' . TelegramText::e($data['bill_no']) : null,
        ]));
        $lines[] = '';
        foreach (array_slice($data['lines'], 0, 25) as $i => $line) {
            $name = $line['item'] !== null
                ? TelegramText::e($line['item']['name'])
                : '⚠ not in inventory: ' . TelegramText::e($line['name']);
            $unit = $line['unit'] !== '' ? $line['unit'] : ($line['item']['unit'] ?? '');
            $lines[] = ($i + 1) . '. ' . $name . ': ' . $qty($line['quantity']) . ' ' . TelegramText::e($unit) . ' × ' . $money($line['unit_price'])
                . ' = ' . $money($line['amount']) . (!empty($line['unsure']) ? ' ⚠' : '');
        }
        if (count($data['lines']) > 25) {
            $lines[] = '… and ' . (count($data['lines']) - 25) . ' more';
        }
        $lines[] = '';
        $lines[] = '<b>Lines: ' . $money($data['lines_total']) . '</b>' . ($data['total'] > 0 ? ' · the bill says ' . $money($data['total']) : '');
        if ($data['note'] !== '') {
            $lines[] = TelegramText::e($data['note']);
        }

        $why = $reader->needsAPerson($bill);
        if ($why !== []) {
            $lines[] = '';
            $lines[] = '<b>This one needs checking in Admin:</b>';
            foreach ($why as $reason) {
                $lines[] = '• ' . TelegramText::e($reason);
            }

            return [implode("\n", $lines), [[$open, $remove]]];
        }
        $lines[] = '';
        $lines[] = 'Check it against the bill, then approve. Approving makes the purchase order as received, so the stock goes in.';

        return [implode("\n", $lines), [
            [['text' => '✅ Approve: paid in cash', 'callback_data' => 'pba:' . $bill->id]],
            [['text' => '✅ Approve: not paid yet', 'callback_data' => 'pbn:' . $bill->id]],
            [$open, $remove],
        ]];
    }

    public function tap(TelegramLink $link, User $user, string $callbackId, int $messageId, string $action, int $billId): void
    {
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
        // Asked again at the press: an item may have been switched off since the card was sent.
        $why = $reader->needsAPerson($bill);
        if ($why !== []) {
            $this->client->answerCallback($bot, $callbackId, 'This one needs checking in Admin: ' . $why[0], true);

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
}
