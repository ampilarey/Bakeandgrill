<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Complaints\Services\ComplaintNotificationService;
use App\Domains\Complaints\Services\ComplaintService;
use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Invoice;
use App\Models\Receipt;
use App\Models\SiteSetting;
use App\Support\ComplaintFormPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

class PublicComplaintController extends Controller
{
    public function __construct(
        private readonly ComplaintService $complaints,
        private readonly ComplaintNotificationService $notifications,
    ) {}

    public function storeForReceipt(Request $request, string $token): JsonResponse
    {
        return $this->store($request, receiptToken: $token);
    }

    public function storeForInvoice(Request $request, string $token): JsonResponse
    {
        return $this->store($request, invoiceToken: $token);
    }

    private function store(Request $request, ?string $receiptToken = null, ?string $invoiceToken = null): JsonResponse
    {
        $token = $receiptToken ?? $invoiceToken ?? '';
        $tokenHash = hash('sha256', $token);
        $ip = (string) $request->ip();

        if (RateLimiter::tooManyAttempts('complaint-ip:'.$ip, 20)) {
            return response()->json(['message' => 'Too many complaints from this network. Try again later.'], 429);
        }
        if (RateLimiter::tooManyAttempts('complaint-token:'.$tokenHash, 10)) {
            return response()->json(['message' => 'Too many complaints for this document. Try again later.'], 429);
        }

        $receipt = null;
        $invoice = null;
        $forInvoice = $invoiceToken !== null;

        if ($forInvoice) {
            $invoice = Invoice::query()->where('token', $invoiceToken)->first();
            if (! $invoice) {
                return response()->json(['message' => 'Not found.'], 404);
            }
            $allowed = Complaint::INVOICE_CATEGORIES;
        } else {
            $receipt = Receipt::query()->with('order.items')->where('token', $receiptToken)->first();
            if (! $receipt || ! $receipt->order) {
                return response()->json(['message' => 'Not found.'], 404);
            }
            $allowed = Complaint::RECEIPT_CATEGORIES;
            if (($receipt->order->type ?? '') !== 'delivery') {
                $allowed = array_values(array_filter(
                    $allowed,
                    fn ($c) => $c !== Complaint::CATEGORY_DELIVERY,
                ));
            }
        }

        $validated = $request->validate([
            'categories' => ['required', 'array', 'min:1', 'max:'.Complaint::MAX_CATEGORIES],
            'categories.*' => ['string', Rule::in($allowed)],
            'comment' => ['nullable', 'string', 'max:2000'],
            'order_item_ids' => ['nullable', 'array', 'max:30'],
            'order_item_ids.*' => ['integer'],
            'idempotency_key' => ['nullable', 'string', 'max:128'],
            'photo_upload_id' => ['nullable', 'string', 'max:64'],
        ]);

        /** @var list<string> $categories */
        $categories = array_values(array_unique($validated['categories']));

        $order = $forInvoice ? $invoice?->order : $receipt?->order;
        $window = $this->windowClosedForCategories(
            $categories,
            $order?->paid_at ?? $order?->created_at ?? ($invoice?->issue_date ?? now()),
        );
        if ($window !== null) {
            return response()->json(['message' => $window, 'window_closed' => true], 422);
        }

        $openCap = max(1, (int) SiteSetting::get('complaint_open_cap_per_receipt', 3));
        $existing = [];
        if ($receipt) {
            $openCount = Complaint::query()
                ->where('receipt_id', $receipt->id)
                ->whereNotIn('status', Complaint::CLOSED_STATUSES)
                ->count();
            $existing = ComplaintFormPresenter::existingForReceipt($receipt);
            if ($openCount >= $openCap) {
                $waBase = (string) SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
                $waHref = $waBase.(str_contains($waBase, '?') ? '&' : '?').'text='.rawurlencode('Complaint about my order');

                return response()->json([
                    'message' => 'This receipt already has open complaints. Please wait for us to respond, or continue on WhatsApp.',
                    'at_open_cap' => true,
                    'existing_complaints' => $existing,
                    'whatsapp_href' => $waHref,
                ], 422);
            }
        } elseif ($invoice) {
            $existing = ComplaintFormPresenter::existingForInvoice($invoice);
        }

        RateLimiter::hit('complaint-ip:'.$ip, 3600);
        RateLimiter::hit('complaint-token:'.$tokenHash, 3600);

        $idem = $validated['idempotency_key'] ?? null;
        if (is_string($idem) && $idem !== '') {
            // Bind idempotency to the hashed token so keys cannot be reused across documents.
            $idem = 'pub:'.$tokenHash.':'.$idem;
        } else {
            $idem = null;
        }

        $items = [];
        if ($order && ! empty($validated['order_item_ids'])) {
            $items = $this->complaints->snapshotOrderItems($order, array_map('intval', $validated['order_item_ids']));
        }

        $complaint = $this->complaints->create([
            'receipt' => $receipt,
            'invoice' => $invoice,
            'order' => $order,
            'source' => $forInvoice ? 'invoice' : 'receipt',
            'categories' => $categories,
            'comment' => $validated['comment'] ?? null,
            'items' => $items,
            'photo_upload_id' => $validated['photo_upload_id'] ?? null,
            'idempotency_key' => $idem,
        ]);

        $canCall = $this->notifications->customerHasUsableContact($complaint);
        $phone = $this->notifications->resolveCustomerPhone($complaint);
        $masked = $phone ? $this->maskPhone($phone) : null;

        $confirmation = $canCall && $masked
            ? "We'll look at this today and call you on {$masked}."
            : "We've recorded this. Please quote reference {$complaint->reference_number} if you contact us.";

        $waBase = (string) SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
        $waText = "Complaint {$complaint->reference_number}";
        $waHref = $waBase.(str_contains($waBase, '?') ? '&' : '?').'text='.rawurlencode($waText);

        if ($receipt) {
            $existing = ComplaintFormPresenter::existingForReceipt($receipt);
            $openCount = Complaint::query()
                ->where('receipt_id', $receipt->id)
                ->whereNotIn('status', Complaint::CLOSED_STATUSES)
                ->count();
            $canAnother = $openCount < $openCap;
        } else {
            $existing = $invoice ? ComplaintFormPresenter::existingForInvoice($invoice) : [];
            $canAnother = true;
        }

        return response()->json([
            'complaint' => [
                'reference_number' => $complaint->reference_number,
                'categories' => $complaint->categoryList(),
                'status' => Complaint::plainStatusLabel((string) $complaint->status),
            ],
            'confirmation' => $confirmation,
            'will_call' => $canCall,
            'whatsapp_href' => $waHref,
            'existing_complaints' => $existing,
            'can_submit_another' => $canAnother,
        ], 201);
    }

    /**
     * Use the LONGEST window among selected categories.
     *
     * @param  list<string>  $categories
     */
    private function windowClosedForCategories(array $categories, mixed $anchor): ?string
    {
        $hours = ComplaintFormPresenter::longestWindowHours($categories);
        if ($hours <= 0) {
            return null;
        }
        $from = $anchor instanceof \DateTimeInterface ? \Illuminate\Support\Carbon::parse($anchor) : now();
        if ($from->diffInMinutes(now()) <= $hours * 60) {
            return null;
        }

        $anyBilling = false;
        foreach ($categories as $c) {
            if (Complaint::isBillingCategory($c)) {
                $anyBilling = true;
                break;
            }
        }

        return $anyBilling
            ? 'The billing complaint window for this document has closed.'
            : 'The complaint window for food and service issues has closed for this order.';
    }

    private function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) < 4) {
            return 'your number on file';
        }

        return substr($digits, 0, 2).str_repeat('x', max(0, strlen($digits) - 4)).substr($digits, -3);
    }
}
