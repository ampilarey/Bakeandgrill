<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Invoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'invoice_number', 'token', 'idempotency_key', 'type', 'status', 'is_tax_invoice',
        'order_id', 'purchase_id', 'customer_id', 'trade_account_id', 'supplier_id', 'created_by',
        'recipient_name', 'recipient_phone', 'recipient_email', 'recipient_address', 'customer_tin',
        'subtotal_laar', 'tax_laar', 'discount_laar', 'total_laar', 'amount_paid_laar',
        'subtotal', 'tax_amount', 'discount_amount', 'total',
        'tax_rate_bp', 'issue_date', 'gst_period_key', 'gst_ledger_date', 'due_date', 'paid_at',
        'payment_method', 'payment_reference',
        'notes', 'terms', 'pdf_path', 'parent_invoice_id', 'credit_note_reason',
    ];

    protected $hidden = ['token'];

    protected $casts = [
        'issue_date' => 'date',
        'due_date' => 'date',
        'gst_ledger_date' => 'date',
        'paid_at' => 'datetime',
        'is_tax_invoice' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::creating(function (Invoice $invoice): void {
            if (empty($invoice->token)) {
                $invoice->token = Str::random(48);
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function tradeAccount(): BelongsTo
    {
        return $this->belongsTo(TradeAccount::class);
    }

    public function tradeAllocations(): HasMany
    {
        return $this->hasMany(TradeInvoiceAllocation::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function gstPeriodDiffersFromIssue(): bool
    {
        if ($this->gst_period_key === null || $this->issue_date === null) {
            return false;
        }

        $issueKey = $this->issue_date->format('Y-m');

        return ! str_starts_with((string) $this->gst_period_key, $issueKey);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function parentInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'parent_invoice_id');
    }

    public function creditNotes(): HasMany
    {
        return $this->hasMany(Invoice::class, 'parent_invoice_id');
    }

    public function balanceDueLaar(): int
    {
        $total = (int) ($this->total_laar ?? round((float) $this->total * 100));

        return max(0, $total - (int) ($this->amount_paid_laar ?? 0));
    }

    public function isOnCreditAccount(): bool
    {
        if (str_contains(strtolower($this->notes ?? ''), 'credit account')) {
            return true;
        }

        if (!$this->order_id) {
            return false;
        }

        if ($this->relationLoaded('order') && $this->order !== null) {
            $payments = $this->order->relationLoaded('payments')
                ? $this->order->payments
                : null;

            if ($payments !== null) {
                return $payments->contains(
                    fn ($p) => $p->method === 'house_account'
                        && in_array((string) ($p->status ?? ''), ['paid', 'completed', 'confirmed'], true),
                );
            }
        }

        return $this->order()
            ->whereHas('payments', fn ($q) => $q
                ->where('method', 'house_account')
                ->whereIn('status', ['paid', 'completed', 'confirmed']))
            ->exists();
    }

    public function displayStatusLabel(): string
    {
        if ($this->status === 'paid') {
            return 'PAID';
        }

        if ($this->isOnCreditAccount() && in_array($this->status, ['sent', 'overdue'], true)) {
            return 'ON CREDIT ACCOUNT';
        }

        return strtoupper((string) $this->status);
    }
}
