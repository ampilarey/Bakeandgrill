<?php

declare(strict_types=1);

namespace App\Domains\Complaints\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\ComplaintBoxEntry;
use App\Models\ComplaintBoxEvent;
use App\Models\SmsTemplate;
use App\Models\User;
use App\Rules\MaldivesPhone;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * The complaint box: file, alert the owner, take up, message the customer.
 *
 * Owner, 2026-09-19: "when a complain is submitted admin/owner should receive
 * a sms notification, when the complains is taken to action, there should be
 * option to send sms to customer if there is mobile number".
 */
class ComplaintBoxService
{
    public function __construct(
        private readonly SmsService $sms,
    ) {}

    /**
     * @param array{
     *   categories: list<string>, comment?: ?string, about_staff?: ?string, phone?: ?string,
     *   order_ref?: ?string, visited_on?: ?string, source?: ?string, ip?: ?string
     * } $data
     */
    public function file(array $data): ComplaintBoxEntry
    {
        $phone = isset($data['phone']) && trim((string) $data['phone']) !== ''
            ? MaldivesPhone::normalize(trim((string) $data['phone']))
            : null;

        $entry = DB::transaction(function () use ($data, $phone) {
            $entry = ComplaintBoxEntry::create([
                'reference_number' => 'PENDING',
                'categories' => array_values(array_unique($data['categories'])),
                'about_staff' => self::clean($data['about_staff'] ?? null, 120),
                'comment' => self::clean($data['comment'] ?? null, 2000),
                'phone' => $phone,
                'is_anonymous' => $phone === null,
                'order_ref' => self::clean($data['order_ref'] ?? null, 40),
                'visited_on' => $data['visited_on'] ?? null,
                'source' => $data['source'] ?? 'web',
                'status' => ComplaintBoxEntry::STATUS_NEW,
                'ip_hash' => isset($data['ip']) ? hash('sha256', (string) $data['ip']) : null,
            ]);
            // Short and readable over the phone: "CB-17".
            $entry->reference_number = 'CB-' . $entry->id;
            $entry->save();

            ComplaintBoxEvent::create([
                'entry_id' => $entry->id,
                'type' => ComplaintBoxEvent::TYPE_STATUS,
                'from_status' => null,
                'to_status' => ComplaintBoxEntry::STATUS_NEW,
            ]);

            return $entry;
        });

        $this->notifyOwner($entry);
        $this->acknowledgeCustomer($entry);

        return $entry->fresh(['events']);
    }

    /**
     * Every owner with a phone hears about every complaint. The result is
     * written on the entry so a failed alert is visible in admin rather than
     * lost in a log.
     */
    public function notifyOwner(ComplaintBoxEntry $entry): void
    {
        $owners = User::query()
            ->whereHas('role', fn ($q) => $q->where('slug', 'owner'))
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->get();

        if ($owners->isEmpty()) {
            $entry->update(['owner_alert_status' => 'failed', 'owner_alert_detail' => 'No owner phone on file.']);

            return;
        }

        $staff = $entry->about_staff !== null && $entry->about_staff !== '' ? " about {$entry->about_staff}" : '';
        $contact = $entry->is_anonymous ? 'Anonymous.' : 'Customer left a number.';
        $body = $this->renderTemplate('owner_complaint_box_received', [
            'reference' => $entry->reference_number,
            'category' => $entry->categoriesLabel(),
            'staff' => $staff,
            'contact' => $contact,
        ], "New complaint {$entry->reference_number}: {$entry->categoriesLabel()}{$staff}. {$contact} Open Complaint Box in admin.");

        $sent = false;
        $failed = false;
        $details = [];
        foreach ($owners as $owner) {
            try {
                $log = $this->sms->send(new SmsMessage(
                    to: MaldivesPhone::normalize(trim((string) $owner->phone)),
                    message: $body,
                    type: 'owner_complaint_box_received',
                    referenceType: 'complaint_box',
                    referenceId: (string) $entry->id,
                    idempotencyKey: 'complaint-box-owner:' . $entry->id . ':' . $owner->id,
                ));
                $status = (string) ($log->status ?? '');
                if (in_array($status, ['sent', 'demo', 'queued'], true)) {
                    $sent = true;
                } elseif (in_array($status, ['disabled', 'suppressed'], true)) {
                    $details[] = "owner {$owner->id}: {$status}";
                } else {
                    $failed = true;
                    $details[] = "owner {$owner->id}: {$status}";
                }
            } catch (\Throwable $e) {
                $failed = true;
                $details[] = "owner {$owner->id}: " . $e->getMessage();
                Log::warning('complaint_box.owner_sms_failed', ['entry_id' => $entry->id, 'owner_id' => $owner->id, 'error' => $e->getMessage()]);
            }
        }

        $entry->update([
            'owner_alert_status' => $sent ? 'sent' : ($failed ? 'failed' : 'suppressed'),
            'owner_alert_detail' => $details === [] ? null : implode('; ', $details),
        ]);
    }

    public function acknowledgeCustomer(ComplaintBoxEntry $entry): void
    {
        if ($entry->phone === null) {
            return;
        }

        $body = $this->renderTemplate('customer_complaint_box_acknowledged', [
            'reference' => $entry->reference_number,
        ], "Bake & Grill: thank you, we have received your complaint ({$entry->reference_number}). We will look into it and message you here.");

        $this->sendToCustomer($entry, $body, 'customer_complaint_box_acknowledged', 'complaint-box-ack:' . $entry->id, null);
    }

    /**
     * Change the status, optionally with a note for staff and a message for
     * the customer. The message goes by SMS when there is a number; without
     * one it is refused rather than silently dropped, so nobody believes they
     * have replied to a person who cannot be reached.
     */
    public function changeStatus(
        ComplaintBoxEntry $entry,
        string $toStatus,
        User $actor,
        ?string $internalNote = null,
        ?string $message = null,
    ): ComplaintBoxEntry {
        if (!in_array($toStatus, ComplaintBoxEntry::STATUSES, true)) {
            throw ValidationException::withMessages(['status' => 'Invalid status.']);
        }
        $message = self::clean($message, 600);
        if ($message !== null && $entry->phone === null) {
            throw ValidationException::withMessages([
                'message' => 'This complaint is anonymous — there is no number to send a message to.',
            ]);
        }

        $from = (string) $entry->status;
        $note = self::clean($internalNote, 2000);

        DB::transaction(function () use ($entry, $from, $toStatus, $actor, $note) {
            if ($note !== null) {
                $entry->internal_note = $note;
            }
            if ($toStatus === ComplaintBoxEntry::STATUS_IN_PROGRESS && $entry->taken_up_at === null) {
                $entry->taken_up_at = now();
            }
            if (in_array($toStatus, ComplaintBoxEntry::OPEN_STATUSES, true)) {
                $entry->resolved_at = null;
                $entry->resolved_by = null;
            } elseif ($from !== $toStatus) {
                $entry->resolved_at = now();
                $entry->resolved_by = $actor->id;
            }
            $entry->status = $toStatus;
            $entry->save();

            if ($from !== $toStatus) {
                ComplaintBoxEvent::create([
                    'entry_id' => $entry->id,
                    'type' => ComplaintBoxEvent::TYPE_STATUS,
                    'from_status' => $from,
                    'to_status' => $toStatus,
                    'user_id' => $actor->id,
                ]);
            }
            if ($note !== null) {
                ComplaintBoxEvent::create([
                    'entry_id' => $entry->id,
                    'type' => ComplaintBoxEvent::TYPE_NOTE,
                    'message' => $note,
                    'user_id' => $actor->id,
                ]);
            }
        });

        if ($message !== null) {
            $this->messageCustomer($entry, $message, $actor);
        }

        return $entry->fresh(['events.user:id,name', 'resolver:id,name']);
    }

    /** Send the owner's words to the customer and keep a record of what was sent and whether it went. */
    public function messageCustomer(ComplaintBoxEntry $entry, string $message, User $actor): ComplaintBoxEvent
    {
        $message = self::clean($message, 600);
        if ($message === null) {
            throw ValidationException::withMessages(['message' => 'Type the message first.']);
        }
        if ($entry->phone === null) {
            throw ValidationException::withMessages([
                'message' => 'This complaint is anonymous — there is no number to send a message to.',
            ]);
        }

        $body = $this->renderTemplate('customer_complaint_box_update', [
            'reference' => $entry->reference_number,
            'message' => $message,
        ], "Bake & Grill ({$entry->reference_number}): {$message}");

        $event = ComplaintBoxEvent::create([
            'entry_id' => $entry->id,
            'type' => ComplaintBoxEvent::TYPE_SMS,
            'message' => $message,
            'sms_status' => 'pending',
            'user_id' => $actor->id,
        ]);

        $status = $this->sendToCustomer(
            $entry,
            $body,
            'customer_complaint_box_update',
            'complaint-box-msg:' . $entry->id . ':' . $event->id,
            $actor,
        );
        $event->update(['sms_status' => $status]);
        $entry->update(['last_message' => $message, 'last_message_at' => now()]);

        if (!in_array($status, ['sent', 'demo', 'queued'], true)) {
            throw ValidationException::withMessages([
                'message' => "The SMS did not go ({$status}). The status change is saved; try the message again.",
            ]);
        }

        return $event->fresh(['user:id,name']);
    }

    private function sendToCustomer(ComplaintBoxEntry $entry, string $body, string $type, string $idempotencyKey, ?User $actor): string
    {
        try {
            $log = $this->sms->send(new SmsMessage(
                to: (string) $entry->phone,
                message: $body,
                type: $type,
                referenceType: 'complaint_box',
                referenceId: (string) $entry->id,
                idempotencyKey: $idempotencyKey,
            ));

            return (string) ($log->status ?? 'failed');
        } catch (\Throwable $e) {
            Log::warning('complaint_box.customer_sms_failed', [
                'entry_id' => $entry->id,
                'type' => $type,
                'actor' => $actor?->id,
                'error' => $e->getMessage(),
            ]);

            return 'failed';
        }
    }

    /** @param array<string, string> $vars */
    private function renderTemplate(string $slug, array $vars, string $fallback): string
    {
        $tpl = SmsTemplate::query()->where('slug', $slug)->first();
        $body = is_string($tpl?->body) && trim($tpl->body) !== '' ? $tpl->body : $fallback;
        foreach ($vars as $key => $value) {
            $body = str_replace('{{' . $key . '}}', $value, $body);
        }

        return $body;
    }

    private static function clean(?string $value, int $max): ?string
    {
        $v = trim((string) $value);

        return $v === '' ? null : mb_substr($v, 0, $max);
    }
}
