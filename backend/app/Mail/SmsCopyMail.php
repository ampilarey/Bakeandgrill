<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Customer;
use App\Support\EmailBrand;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/**
 * The email copy of a text message (SmsEmailCopier). One template for every
 * kind of text, customer, staff or owner: the message itself, its links as
 * buttons, and for promotions an unsubscribe link and header.
 */
class SmsCopyMail extends Mailable
{
    use Queueable;

    /**
     * @param  'customer'|'staff'|'marketing'  $audience
     */
    public function __construct(
        public string $message,
        public string $type,
        public string $label,
        public string $audience,
        public string $phone,
        public ?int $customerId = null,
    ) {}

    public function build(): self
    {
        $brand = EmailBrand::variables()['name'];
        $text = self::withoutOptOutLine($this->message);
        $links = self::links($text);

        return $this->subject($this->subjectLine($text, $brand))
            ->view('emails.sms_copy')
            ->text('emails.sms_copy_text')
            ->with([
                'brandName' => $brand,
                'audience' => $this->audience,
                'heading' => $this->heading(),
                'greetingName' => $this->customerName(),
                'body' => self::withoutLinks($text),
                'links' => $links,
                'maskedPhone' => EmailBrand::maskPhone($this->phone),
                'unsubscribeUrl' => $this->unsubscribeUrl(),
            ]);
    }

    public function headers(): Headers
    {
        $url = $this->unsubscribeUrl();

        return new Headers(text: $url === null ? [] : [
            'List-Unsubscribe' => '<' . $url . '>',
            'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
        ]);
    }

    /** Signed link to stop promotions; only on promotional copies. */
    public function unsubscribeUrl(): ?string
    {
        if ($this->audience !== 'marketing' || $this->customerId === null) {
            return null;
        }

        return URL::signedRoute('email.unsubscribe', ['customer' => $this->customerId]);
    }

    /**
     * Links in the text, each with a label that says what it opens.
     *
     * @return list<array{url: string, label: string}>
     */
    public static function links(string $text): array
    {
        preg_match_all('#https?://[^\s<>"]+#i', $text, $m);
        $out = [];
        foreach (array_unique($m[0]) as $url) {
            $url = rtrim($url, '.,;:!?)');
            $out[] = ['url' => $url, 'label' => self::linkLabel($url)];
        }

        return $out;
    }

    public static function linkLabel(string $url): string
    {
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        return match (true) {
            str_contains($path, '/pay') => 'Pay now',
            str_contains($path, '/invoices/') => 'View invoice',
            str_contains($path, '/receipts/') => 'View receipt',
            str_contains($path, '/track') || str_contains($path, '/orders/') => 'Track your order',
            in_array(rtrim($path, '/'), ['', '/order', '/menu', '/order/menu'], true) => 'Order now',
            str_contains($path, '/reserv') => 'View your booking',
            str_contains($path, '/quote') || str_contains($path, '/events') => 'View the details',
            str_contains($path, '/gift') => 'View gift card',
            str_contains($path, '/review') || str_contains($path, '/feedback') => 'Leave a review',
            str_contains($path, '/complain') => 'View complaint',
            str_starts_with($path, '/pos') => 'Open the POS',
            str_starts_with($path, '/admin') => 'Open in Admin',
            default => 'Open link',
        };
    }

    /**
     * The text without its web addresses, which become buttons instead:
     * "Ready. Track: https://…" → "Ready." A short label just before a link
     * ("Track:", "Pay online:") goes with it.
     */
    public static function withoutLinks(string $text): string
    {
        $label = '(?:\s*(?:Track|Pay|View|Open|Order|See|Details|Link|Invoice|Receipt|Menu|Book|Review|More|Click|Tap|Here)(?:\s+\p{L}+){0,3}\s*:)?';
        $text = preg_replace('#' . $label . '\s*https?://[^\s<>"]+#iu', '', $text) ?? $text;
        // "Close it in the POS: <link>" → "Close it in the POS".
        $text = preg_replace('/\s*:\s*$/m', '', $text) ?? $text;

        return trim((string) preg_replace('/[ \t]{2,}/', ' ', $text));
    }

    /** Drop the "Stop: bakeandgrill.mv/sms" line; the email has its own unsubscribe. */
    public static function withoutOptOutLine(string $text): string
    {
        $text = preg_replace('#\s*(Stop|STOP|Opt out|Unsubscribe)\s*:?\s*(https?://)?\S*/sms(/preferences)?\S*\s*$#u', '', $text) ?? $text;

        return trim($text);
    }

    private function subjectLine(string $text, string $brand): string
    {
        if ($this->audience === 'staff') {
            $label = self::plainLabel($this->label);

            return $label !== '' ? 'Alert: ' . $label : 'Alert from ' . $brand;
        }
        $first = trim((string) preg_replace('#https?://\S+#', '', $text));
        $first = preg_split('/(?<=[.!?])\s+|\n/u', $first)[0] ?? '';
        $first = rtrim(trim($first, " \t\n\r\0\x0B:-"), '.');

        return $first !== '' ? Str::limit($first, 78, '…') : 'A message from ' . $brand;
    }

    private function heading(): string
    {
        if ($this->audience === 'staff') {
            return self::plainLabel($this->label) ?: 'Staff alert';
        }

        return $this->audience === 'marketing' ? 'News from us' : 'A message for you';
    }

    /** "Owner: shift left open" → "Shift left open"; legacy catch-all labels → "". */
    public static function plainLabel(string $label): string
    {
        $label = trim((string) preg_replace('/^(Owner|Staff)\s*:\s*/i', '', $label));
        if ($label === '' || str_contains(strtolower($label), '(legacy)')) {
            return '';
        }

        return Str::ucfirst($label);
    }

    private function customerName(): ?string
    {
        // No second greeting when the text already opens with one.
        if ($this->audience === 'staff' || $this->customerId === null || preg_match('/^\s*(hi|hello|dear|salaam)\b/i', $this->message)) {
            return null;
        }
        $name = trim((string) Customer::whereKey($this->customerId)->value('name'));

        return $name !== '' && !preg_match('/^\+?\d[\d\s]+$/', $name) ? Str::before($name, ' ') : null;
    }
}
