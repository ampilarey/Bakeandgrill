<?php

declare(strict_types=1);

namespace App\Domains\Newsletter;

use App\Domains\Customers\Support\MessageChoices;
use App\Jobs\SendNewsletterBatch;
use App\Mail\NewsletterConfirmMail;
use App\Mail\NewsletterIssueMail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\NewsletterDelivery;
use App\Models\NewsletterIssue;
use App\Models\NewsletterSubscriber;
use App\Models\Promotion;
use App\Services\SpecialPricingService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * The email newsletter (iruali import plan, feature 4).
 *
 * Sign-up is double opt-in: nothing goes until the confirm link is clicked. An
 * issue reaches confirmed subscribers and customers with a checked email who
 * allow offers by email (feature 5), once per address, never an address that
 * unsubscribed. Sending freezes the picked dishes on the issue, writes one
 * delivery row per address (unique per issue and address) and queues batches
 * of 100 a few seconds apart; each batch claims a row before sending it, so a
 * retried batch never sends an address twice.
 */
final class Newsletter
{
    public const BATCH = 100;

    public const SECTIONS = ['new', 'specials', 'offer', 'coming'];

    public function subscribe(string $email, string $locale, string $source, ?Customer $customer = null): NewsletterSubscriber
    {
        $email = mb_strtolower(trim($email));
        $sub = NewsletterSubscriber::query()->firstOrNew(['email' => $email]);
        $sub->locale = $locale === 'dv' ? 'dv' : 'en';
        $sub->source = $sub->exists ? $sub->source : $source;
        $sub->customer_id ??= $customer?->id;
        $sub->token ??= Str::random(48);
        // An address that bounced or left confirms again before anything goes.
        $wasOut = $sub->unsubscribed_at !== null || $sub->bounced_at !== null;
        $sub->unsubscribed_at = null;
        if ($wasOut) {
            $sub->confirmed_at = null;
        }
        $sub->save();
        if ($sub->confirmed_at === null) {
            Mail::to($email)->send(new NewsletterConfirmMail($sub));
        }

        return $sub;
    }

    public function confirm(string $token): ?NewsletterSubscriber
    {
        $sub = NewsletterSubscriber::query()->where('token', $token)->first();
        if ($sub !== null && $sub->confirmed_at === null) {
            $sub->forceFill(['confirmed_at' => now(), 'unsubscribed_at' => null, 'bounced_at' => null, 'bounce_count' => 0])->save();
        }

        return $sub;
    }

    public function unsubscribe(NewsletterSubscriber $sub): void
    {
        $sub->forceFill(['unsubscribed_at' => now()])->save();
        $customer = $sub->customer_id ? Customer::query()->find($sub->customer_id) : Customer::query()->whereRaw('LOWER(email) = ?', [$sub->email])->first();
        if ($customer !== null) {
            MessageChoices::update($customer, [MessageChoices::OFFERS => [MessageChoices::EMAIL => false]]);
        }
    }

    /**
     * Who an issue goes to: confirmed subscribers and customers who allow offers by email,
     * one row per address, with a subscriber row (and so an unsubscribe link) for each.
     *
     * @return Collection<int, NewsletterSubscriber>
     */
    public function audience(): Collection
    {
        $out = NewsletterSubscriber::query()->whereNotNull('confirmed_at')->whereNull('unsubscribed_at')->whereNull('bounced_at')->get()->keyBy('email');
        $blocked = NewsletterSubscriber::query()->where(fn ($q) => $q->whereNotNull('unsubscribed_at')->orWhereNotNull('bounced_at'))->pluck('email')->flip();
        Customer::query()->whereNotNull('email')->whereNotNull('email_verified_at')->where('is_active', true)->orderBy('id')
            ->chunk(500, function ($customers) use ($out, $blocked): void {
                foreach ($customers as $customer) {
                    $email = mb_strtolower(trim((string) $customer->email));
                    if ($email === '' || $out->has($email) || $blocked->has($email) || !MessageChoices::allows($customer, MessageChoices::OFFERS, MessageChoices::EMAIL)) {
                        continue;
                    }
                    $out->put($email, NewsletterSubscriber::query()->firstOrCreate(['email' => $email], [
                        'locale' => $customer->preferred_language === 'dv' ? 'dv' : 'en',
                        'token' => Str::random(48),
                        'confirmed_at' => $customer->email_verified_at,
                        'source' => 'customer',
                        'customer_id' => $customer->id,
                    ]));
                }
            });

        return $out->values();
    }

    /**
     * The dishes and offer an issue shows: frozen once sent, live while a draft.
     *
     * @return array{new: list<array<string, mixed>>, specials: list<array<string, mixed>>, offer: ?array<string, mixed>, coming: list<array<string, mixed>>}
     */
    public function picks(NewsletterIssue $issue): array
    {
        if (is_array($issue->frozen)) {
            return $issue->frozen + ['new' => [], 'specials' => [], 'offer' => null, 'coming' => []];
        }
        $sections = $issue->sections ?? [];
        $removed = array_map('intval', $issue->removed_item_ids ?? []);
        $dish = fn (Item $i) => ['id' => $i->id, 'name' => (string) ($i->card_name ?: $i->name), 'name_dv' => $i->name_dv, 'price' => (float) $i->base_price, 'image' => $i->thumb_url ? url((string) $i->thumb_url) : ($i->image_url ? url((string) $i->image_url) : null), 'url' => url('/menu/' . $i->id)];
        $out = ['new' => [], 'specials' => [], 'offer' => null, 'coming' => []];
        if (!empty($sections['new'])) {
            $days = max(1, min(90, (int) ($sections['new_days'] ?? 14)));
            $out['new'] = Item::query()->where('is_active', true)->where('created_at', '>=', now()->subDays($days))
                ->whereNull('launch_at')->whereNotIn('id', $removed)->orderByDesc('created_at')->limit(8)->get()->map($dish)->values()->all();
        }
        if (!empty($sections['coming'])) {
            $out['coming'] = Item::query()->where('is_active', true)->where('launch_at', '>', now())
                ->whereNotIn('id', $removed)->orderBy('launch_at')->limit(6)->get()
                ->map(fn (Item $i) => $dish($i) + ['launch_at' => $i->launch_at?->toIso8601String()])->values()->all();
        }
        if (!empty($sections['specials'])) {
            try {
                $out['specials'] = collect(app(SpecialPricingService::class)->activeSpecialsForDisplay())->take(6)->map(fn ($row) => [
                    'name' => (string) data_get($row, 'name', data_get($row, 'item_name', '')),
                    'price' => (float) data_get($row, 'special_price', data_get($row, 'price', 0)),
                ])->filter(fn ($r) => $r['name'] !== '')->values()->all();
            } catch (\Throwable) {
                $out['specials'] = [];
            }
        }
        if (!empty($sections['offer_id'])) {
            $promo = Promotion::query()->find((int) $sections['offer_id']);
            $out['offer'] = $promo ? ['name' => (string) $promo->name, 'description' => (string) ($promo->description ?? ''), 'code' => $promo->code, 'ends' => $promo->expires_at?->toDateString()] : null;
        }

        return $out;
    }

    public function sendTest(NewsletterIssue $issue, string $email, string $locale): void
    {
        $sub = new NewsletterSubscriber(['email' => $email, 'locale' => $locale, 'token' => 'test']);
        Mail::to($email)->send(new NewsletterIssueMail($issue, $sub, $this->picks($issue), true));
    }

    /** Freeze the picks, write a delivery per address and queue the batches. Returns how many. */
    public function send(NewsletterIssue $issue): int
    {
        $count = DB::transaction(function () use ($issue): int {
            $locked = NewsletterIssue::query()->whereKey($issue->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== NewsletterIssue::DRAFT) {
                abort(422, 'This newsletter has already been sent.');
            }
            $locked->forceFill(['frozen' => $this->picks($locked), 'status' => NewsletterIssue::SENDING])->save();
            $n = 0;
            foreach ($this->audience() as $sub) {
                NewsletterDelivery::query()->firstOrCreate(
                    ['issue_id' => $locked->id, 'email' => $sub->email],
                    ['subscriber_id' => $sub->id, 'locale' => $sub->locale, 'status' => 'pending'],
                );
                $n++;
            }

            return $n;
        });
        $this->queuePending($issue->fresh());

        return $count;
    }

    /** Queue every pending row (a first send, or failed rows put back by retry). */
    public function queuePending(NewsletterIssue $issue): void
    {
        $ids = NewsletterDelivery::query()->where('issue_id', $issue->id)->where('status', 'pending')->orderBy('id')->pluck('id');
        foreach ($ids->chunk(self::BATCH)->values() as $i => $chunk) {
            SendNewsletterBatch::dispatch($issue->id, $chunk->values()->all())->delay(now()->addSeconds($i * 5));
        }
        if ($ids->isEmpty()) {
            $this->finishIfDone($issue);
        }
    }

    public function retryFailed(NewsletterIssue $issue): int
    {
        $n = NewsletterDelivery::query()->where('issue_id', $issue->id)->where('status', 'failed')->update(['status' => 'pending', 'error' => null]);
        $issue->forceFill(['status' => NewsletterIssue::SENDING])->save();
        $this->queuePending($issue);

        return $n;
    }

    public function finishIfDone(NewsletterIssue $issue): void
    {
        $open = NewsletterDelivery::query()->where('issue_id', $issue->id)->whereIn('status', ['pending', 'sending'])->exists();
        if (!$open && $issue->status === NewsletterIssue::SENDING) {
            $issue->forceFill(['status' => NewsletterIssue::SENT, 'sent_at' => $issue->sent_at ?? now()])->save();
        }
    }
}
