<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerCreditLedger;
use App\Models\GiftCard;
use App\Models\Invoice;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\PreOrder;
use App\Models\Promotion;
use App\Models\PushSubscription;
use App\Models\Receipt;
use App\Models\Referral;
use App\Models\ReferralCode;
use App\Models\Reservation;
use App\Models\Review;
use App\Models\SmsCampaignRecipient;
use App\Models\SmsLog;
use App\Models\SmsPromotionRecipient;
use App\Rules\MaldivesPhone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Admin-only customer identity operations: phone change and account merge.
 */
final class CustomerAccountService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @return array{customer: Customer, revoked_tokens: int}
     */
    public function changePhone(Customer $customer, string $rawPhone, ?Request $request = null): array
    {
        $phone = MaldivesPhone::normalize($rawPhone);

        if ($phone === $customer->phone) {
            throw ValidationException::withMessages([
                'phone' => ['The new phone number is the same as the current one.'],
            ]);
        }

        $conflict = Customer::withTrashed()
            ->where('phone', $phone)
            ->where('id', '!=', $customer->id)
            ->exists();

        if ($conflict) {
            throw ValidationException::withMessages([
                'phone' => ['This phone number is already registered to another customer. Merge accounts instead.'],
            ]);
        }

        $oldPhone = $customer->phone;

        return DB::transaction(function () use ($customer, $phone, $oldPhone, $request): array {
            $customer->update(['phone' => $phone]);

            $revoked = $customer->tokens()->where('name', 'like', 'customer-%')->delete();

            $this->audit->log(
                'customer.phone_changed',
                'Customer',
                $customer->id,
                ['phone' => $oldPhone],
                ['phone' => $phone],
                ['revoked_tokens' => $revoked],
                $request,
            );

            return [
                'customer' => $customer->fresh(),
                'revoked_tokens' => $revoked,
            ];
        });
    }

    /**
     * Merge one or more source customers into the primary account.
     *
     * @param  list<int>  $sourceIds
     * @return array{customer: Customer, merged: list<array{id: int, phone: string|null}>}
     */
    public function mergeAccounts(Customer $primary, array $sourceIds, ?Request $request = null): array
    {
        $sourceIds = array_values(array_unique(array_map('intval', $sourceIds)));
        $sourceIds = array_values(array_filter($sourceIds, fn (int $id) => $id !== $primary->id));

        if ($sourceIds === []) {
            throw ValidationException::withMessages([
                'source_customer_ids' => ['Select at least one other customer to merge.'],
            ]);
        }

        $sources = Customer::withTrashed()->whereIn('id', $sourceIds)->get();

        if ($sources->count() !== count($sourceIds)) {
            throw ValidationException::withMessages([
                'source_customer_ids' => ['One or more customers could not be found.'],
            ]);
        }

        $merged = [];

        return DB::transaction(function () use ($primary, $sources, $request, &$merged): array {
            foreach ($sources as $source) {
                $this->mergeOne($primary, $source);
                $merged[] = ['id' => $source->id, 'phone' => $source->phone];
            }

            $this->refreshPrimaryStats($primary);

            $note = sprintf(
                'Merged accounts on %s: %s',
                now()->format('Y-m-d H:i'),
                collect($merged)->map(fn (array $m) => "#{$m['id']} ({$m['phone']})")->join(', '),
            );
            $existingNotes = trim((string) $primary->internal_notes);
            $primary->update([
                'internal_notes' => $existingNotes !== '' ? $existingNotes . "\n" . $note : $note,
            ]);

            $this->audit->log(
                'customer.accounts_merged',
                'Customer',
                $primary->id,
                [],
                ['merged_source_ids' => collect($merged)->pluck('id')->all()],
                ['sources' => $merged],
                $request,
            );

            return [
                'customer' => $primary->fresh(),
                'merged' => $merged,
            ];
        });
    }

    private function mergeOne(Customer $primary, Customer $source): void
    {
        if ($source->id === $primary->id) {
            return;
        }

        Order::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        Receipt::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        Invoice::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        PreOrder::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        Reservation::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        SmsLog::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        PushSubscription::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        SmsCampaignRecipient::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        SmsPromotionRecipient::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);

        GiftCard::where('issued_to_customer_id', $source->id)->update(['issued_to_customer_id' => $primary->id]);
        GiftCard::where('purchased_by_customer_id', $source->id)->update(['purchased_by_customer_id' => $primary->id]);

        Promotion::where('restricted_customer_id', $source->id)->update(['restricted_customer_id' => $primary->id]);

        $this->mergeAddresses($primary, $source);
        $this->mergeFavorites($primary, $source);
        $this->mergeReviews($primary, $source);
        $this->mergeReferrals($primary, $source);
        $this->mergeLoyalty($primary, $source);
        $this->mergeCredit($primary, $source);

        if (!$primary->name && $source->name) {
            $primary->update(['name' => $source->name]);
        }
        if (!$primary->email && $source->email) {
            $primary->update(['email' => $source->email]);
        }

        $source->tokens()->where('name', 'like', 'customer-%')->delete();

        if (!$source->trashed()) {
            $source->delete();
        }
    }

    private function mergeAddresses(Customer $primary, Customer $source): void
    {
        $primaryHasDefault = CustomerAddress::where('customer_id', $primary->id)->where('is_default', true)->exists();

        CustomerAddress::where('customer_id', $source->id)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->each(function (CustomerAddress $address) use ($primary, &$primaryHasDefault): void {
                if ($address->is_default && $primaryHasDefault) {
                    $address->update(['customer_id' => $primary->id, 'is_default' => false]);
                } else {
                    if ($address->is_default) {
                        $primaryHasDefault = true;
                    }
                    $address->update(['customer_id' => $primary->id]);
                }
            });
    }

    private function mergeFavorites(Customer $primary, Customer $source): void
    {
        $existingItemIds = DB::table('customer_favorites')
            ->where('customer_id', $primary->id)
            ->pluck('item_id')
            ->all();

        $sourceFavorites = DB::table('customer_favorites')
            ->where('customer_id', $source->id)
            ->get();

        foreach ($sourceFavorites as $row) {
            if (in_array($row->item_id, $existingItemIds, true)) {
                DB::table('customer_favorites')
                    ->where('customer_id', $source->id)
                    ->where('item_id', $row->item_id)
                    ->delete();
            } else {
                DB::table('customer_favorites')
                    ->where('customer_id', $source->id)
                    ->where('item_id', $row->item_id)
                    ->update(['customer_id' => $primary->id]);
                $existingItemIds[] = $row->item_id;
            }
        }
    }

    private function mergeReviews(Customer $primary, Customer $source): void
    {
        Review::where('customer_id', $source->id)->each(function (Review $review) use ($primary): void {
            $conflict = Review::where('customer_id', $primary->id)
                ->where('order_id', $review->order_id)
                ->where('item_id', $review->item_id)
                ->exists();

            if ($conflict) {
                $review->delete();
            } else {
                $review->update(['customer_id' => $primary->id]);
            }
        });
    }

    private function mergeReferrals(Customer $primary, Customer $source): void
    {
        $primaryHasCode = ReferralCode::where('customer_id', $primary->id)->exists();

        ReferralCode::where('customer_id', $source->id)->each(function (ReferralCode $code) use ($primary, $primaryHasCode): void {
            if (!$primaryHasCode) {
                $code->update(['customer_id' => $primary->id]);
            }
        });

        Referral::where('referee_customer_id', $source->id)->each(function (Referral $referral) use ($primary): void {
            $conflict = Referral::where('referral_code_id', $referral->referral_code_id)
                ->where('referee_customer_id', $primary->id)
                ->exists();

            if ($conflict) {
                $referral->delete();
            } else {
                $referral->update(['referee_customer_id' => $primary->id]);
            }
        });
    }

    private function mergeLoyalty(Customer $primary, Customer $source): void
    {
        $primaryAccount = LoyaltyAccount::firstOrCreate(
            ['customer_id' => $primary->id],
            ['points_balance' => 0, 'points_held' => 0, 'lifetime_points' => 0, 'tier' => 'bronze'],
        );

        $sourceAccount = LoyaltyAccount::where('customer_id', $source->id)->first();

        LoyaltyLedger::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);
        LoyaltyHold::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);

        if ($sourceAccount) {
            $primaryAccount->update([
                'points_balance' => $primaryAccount->points_balance + $sourceAccount->points_balance,
                'points_held' => $primaryAccount->points_held + $sourceAccount->points_held,
                'lifetime_points' => $primaryAccount->lifetime_points + $sourceAccount->lifetime_points,
                'tier' => $this->tierForLifetimePoints(
                    $primaryAccount->lifetime_points + $sourceAccount->lifetime_points,
                ),
            ]);
            $sourceAccount->delete();
        }

        $primaryAccount->refresh();
        $primary->update([
            'loyalty_points' => $primaryAccount->points_balance,
            'tier' => $primaryAccount->tier,
        ]);
    }

    private function mergeCredit(Customer $primary, Customer $source): void
    {
        CustomerCreditLedger::where('customer_id', $source->id)->update(['customer_id' => $primary->id]);

        if (!$source->credit_enabled) {
            return;
        }

        if (!$primary->credit_enabled) {
            $primary->update([
                'credit_enabled' => true,
                'credit_status' => $source->credit_status ?? 'active',
                'credit_limit_laar' => (int) ($source->credit_limit_laar ?? 0),
                'credit_balance_laar' => (int) ($source->credit_balance_laar ?? 0),
                'credit_approved_by' => $source->credit_approved_by,
                'credit_approved_at' => $source->credit_approved_at,
                'credit_notes' => $source->credit_notes,
                'credit_payment_terms_days' => $source->credit_payment_terms_days ?? 30,
                'credit_reminder_sms' => $source->credit_reminder_sms ?? true,
            ]);

            return;
        }

        $primary->update([
            'credit_limit_laar' => (int) $primary->credit_limit_laar + (int) ($source->credit_limit_laar ?? 0),
            'credit_balance_laar' => (int) $primary->credit_balance_laar + (int) ($source->credit_balance_laar ?? 0),
        ]);
    }

    private function refreshPrimaryStats(Customer $primary): void
    {
        $lastOrderAt = Order::where('customer_id', $primary->id)
            ->whereNotNull('paid_at')
            ->max('paid_at');

        $primary->update([
            'last_order_at' => $lastOrderAt ?: $primary->last_order_at,
        ]);
    }

    private function tierForLifetimePoints(int $lifetime): string
    {
        return match (true) {
            $lifetime >= 15000 => 'platinum',
            $lifetime >= 5000 => 'gold',
            $lifetime >= 1000 => 'silver',
            default => 'bronze',
        };
    }
}
