<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Jobs\ExportPosterJob;
use App\Mail\PosterShopMail;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Poster;
use App\Models\PosterExport;
use App\Models\PosterOrder;
use App\Models\SiteSetting;
use App\Models\Supplier;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use RuntimeException;
use Throwable;

/**
 * One print-shop order: the file, the proof, the quote and the expense
 * (docs/POSTER_PLAN.md § 9).
 */
final class PosterOrders
{
    public const PROOF_SETTING = 'poster_proof_approval';

    public const PROOF_ALERT = 'owner_poster_proof';

    public static function proofRequired(): bool
    {
        return SiteSetting::get(self::PROOF_SETTING, 'false') === 'true';
    }

    /**
     * @param array<string, mixed> $job
     */
    public static function send(Poster $poster, Supplier $shop, array $job, ?int $userId): PosterOrder
    {
        if ($shop->kind !== 'print_shop') {
            throw new RuntimeException('That record is not a print shop.');
        }
        $prefs = PrintShopPrefs::normalize(is_array($shop->print_prefs) ? $shop->print_prefs : null);
        $material = (string) ($job['material'] ?? 'foam');
        $job['layers'] = $prefs['layers'];
        $job['white_name'] = $prefs['white_name'];
        $job['gloss_name'] = $prefs['gloss_name'];
        $job['mirror'] = (bool) ($job['mirror'] ?? (PosterPreflight::MATERIALS[$material]['mirror'] ?? false));

        // A quick preflight of the first size here, so a red check is said at once; the file
        // itself is made on the queue (an A2 with big photos is too heavy for a web request).
        $paper = PaperSize::named((string) (($job['sizes'] ?? $poster->sizes ?? ['A4'])[0] ?? 'A4'), (bool) $poster->landscape)->mounted((string) ($job['mounting'] ?? 'none'));
        $content = PosterContent::resolve($poster->toArray());
        $checks = PosterPreflight::check($poster->toArray(), $content, PosterPieces::build($poster->toArray(), $paper, $content), $paper, $job);
        if (PosterPreflight::blocked($checks)) {
            throw new RuntimeException('Preflight failed. Fix the red checks and try again.');
        }
        $export = PosterExport::query()->create([
            'poster_id' => $poster->id,
            'version' => $poster->version,
            'status' => 'queued',
            'request' => $job,
        ]);

        $order = PosterOrder::query()->create([
            'poster_id' => $poster->id,
            'poster_export_id' => $export->id,
            'supplier_id' => $shop->id,
            'state' => 'draft',
            'quantities' => $job['quantity'] ?? null,
            'material' => $material,
            'finish' => (string) ($job['finish'] ?? 'matte'),
            'gloss' => (string) ($job['gloss'] ?? 'none'),
            'white' => (string) ($job['white'] ?? 'none'),
            'mounting' => (string) ($job['mounting'] ?? 'none'),
            'imposition' => (string) ($job['imposition'] ?? 'single'),
            'deadline' => $job['deadline'] ?? null,
            'place' => $poster->place,
            'state_log' => [],
            'created_by' => $userId,
        ]);
        self::push($order, 'draft', $userId, 'Opened; preparing the print file');
        ExportPosterJob::dispatch($export->id, $order->id);

        return $order->fresh(['poster', 'shop', 'export']);
    }

    /**
     * The order's print file is ready (ExportPosterJob): ask for the proof when
     * proof approval is on, else email the shop. A shop with no email is noted on
     * the order, so the ZIP can be sent by hand from My posters.
     */
    public static function exportFinished(int $orderId): void
    {
        $order = PosterOrder::query()->with('shop', 'poster', 'export')->find($orderId);
        if ($order === null || $order->state !== 'draft') {
            return;
        }
        if (self::proofRequired()) {
            self::askForProof($order);

            return;
        }
        try {
            self::emailShop($order);
        } catch (RuntimeException $e) {
            self::push($order, 'draft', null, 'Not emailed: ' . $e->getMessage());

            return;
        }
        self::push($order, 'sent', $order->created_by, 'Emailed the shop');
    }

    /** The order's print file could not be made: said on the order. */
    public static function exportFailed(int $orderId, string $why): void
    {
        $order = PosterOrder::query()->find($orderId);
        if ($order !== null && $order->state === 'draft') {
            self::push($order, 'draft', null, 'The print file failed: ' . $why);
        }
    }

    public static function approveProof(PosterOrder $order, ?int $userId = null): PosterOrder
    {
        $order->loadMissing('shop', 'poster', 'export');
        if ($order->state !== 'draft') {
            return $order;
        }
        if ($order->export?->status !== 'ready') {
            throw new RuntimeException('The print file is still being made. Try again in a minute.');
        }
        self::push($order, 'proof_approved', $userId, 'Proof approved');
        self::emailShop($order);
        self::push($order, 'sent', $userId, 'Emailed the shop');

        return $order->fresh(['poster', 'shop']);
    }

    public static function quote(PosterOrder $order, float $mvr, ?string $note, ?int $userId): PosterOrder
    {
        if ($order->state !== 'sent') {
            throw new RuntimeException('A quote is typed once the file has been sent.');
        }
        $order->quote_mvr = round($mvr, 2);
        $order->quote_note = $note;
        $order->save();
        self::push($order, 'sent', $userId, 'Quote MVR ' . number_format($mvr, 2));

        return $order->fresh();
    }

    public static function approveQuote(PosterOrder $order, ?int $userId): PosterOrder
    {
        $order->loadMissing('poster', 'shop');
        if ($order->state !== 'sent' || $order->quote_mvr === null) {
            throw new RuntimeException('Approve the shop\'s price after it is typed on the sent order.');
        }
        if ($userId === null && $order->created_by === null) {
            throw new RuntimeException('A person has to approve the quote.');
        }
        $laar = (int) round(((float) $order->quote_mvr) * 100);
        $category = ExpenseCategory::query()->firstOrCreate(
            ['slug' => 'printing'],
            ['name' => 'Printing', 'is_active' => true],
        );
        $expense = Expense::query()->create([
            'expense_number' => 'EXP-POSTER-' . $order->id,
            'expense_category_id' => $category->id,
            'supplier_id' => $order->supplier_id,
            'user_id' => $userId ?? $order->created_by,
            'description' => 'Poster ' . $order->poster->code() . ' — ' . $order->poster->name,
            'amount_laar' => $laar,
            'amount' => $order->quote_mvr,
            'amount_excluding_gst_laar' => $laar,
            'tax_laar' => 0,
            'tax_amount' => 0,
            'gst_rate_bp' => 0,
            'expense_date' => now()->toDateString(),
            'status' => 'approved',
            'approved_by' => $userId,
            'notes' => 'Print shop quote',
        ]);
        $order->expense_id = $expense->id;
        $order->save();
        self::push($order, 'quote_approved', $userId, 'Expense ' . $expense->expense_number);

        return $order->fresh(['expense']);
    }

    public static function advance(PosterOrder $order, string $state, ?int $userId): PosterOrder
    {
        $allowed = [
            'received' => 'quote_approved',
            'up' => 'received',
            'down' => 'up',
        ];
        if (!isset($allowed[$state]) || $order->state !== $allowed[$state]) {
            throw new RuntimeException('That step does not follow this order.');
        }
        self::push($order, $state, $userId, '');
        if ($state === 'up') {
            $order->poster?->update(['state' => 'up']);
        }
        if ($state === 'down') {
            $order->poster?->update(['state' => 'down']);
        }

        return $order->fresh();
    }

    public static function proofLink(PosterOrder $order): string
    {
        return URL::temporarySignedRoute('posters.proof', now()->addDay(), ['order' => $order->id]);
    }

    private static function emailShop(PosterOrder $order): void
    {
        $order->loadMissing('shop', 'poster', 'export');
        $email = trim((string) $order->shop?->email);
        if ($email === '' || !is_string($order->export?->zip_path) || !is_file($order->export->zip_path)) {
            throw new RuntimeException('This shop has no email, or the print file is not ready. Download the ZIP and send it by hand.');
        }
        $zip = (string) file_get_contents($order->export->zip_path);
        $proof = PosterProof::jpeg($order->poster);
        Mail::to($email)->send(new PosterShopMail($order, $zip, $proof));
    }

    private static function askForProof(PosterOrder $order): void
    {
        if (!AlertSwitch::isOn(self::PROOF_ALERT)) {
            return;
        }
        $order->loadMissing('poster');
        $link = self::proofLink($order);
        try {
            foreach (OwnerPhones::for(self::PROOF_ALERT) as $phone) {
                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: 'Poster ' . $order->poster->code() . ' is ready to send to the shop. Approve it: ' . $link,
                    type: self::PROOF_ALERT,
                    referenceType: 'poster_order',
                    referenceId: (string) $order->id,
                    idempotencyKey: 'poster-proof:' . $order->id . ':' . $phone,
                ));
            }
        } catch (Throwable $e) {
            Log::warning('poster: proof SMS could not be sent', ['order' => $order->id, 'error' => $e->getMessage()]);
        }
    }

    private static function push(PosterOrder $order, string $state, ?int $userId, string $note): void
    {
        $log = is_array($order->state_log) ? $order->state_log : [];
        $log[] = [
            'state' => $state,
            'at' => now()->toIso8601String(),
            'by' => $userId,
            'note' => $note,
        ];
        $order->state = $state;
        $order->state_log = $log;
        $order->save();
    }
}
