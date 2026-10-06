<?php

declare(strict_types=1);

namespace Tests\Feature\Mail;

use App\Mail\CustomerOtpMail;
use App\Mail\EventConfirmedMail;
use App\Mail\EventQuoteSentMail;
use App\Mail\EventRequestReceivedMail;
use App\Mail\GiftCardMail;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\GiftCard;
use App\Models\SiteSetting;
use App\Support\EmailBrand;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Owner, 2026-10-06 (screenshot of the plain code email): "Enhance the
 * email send with branding and other features". All customer emails share
 * emails/layout.blade.php; the code email gained its own features.
 */
class BrandedEmailsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_code_leads_the_subject_and_the_wording_follows_the_purpose(): void
    {
        $login = new CustomerOtpMail('718894', 10, 'register', '+9607820288');
        $login->build();
        $this->assertSame('718894 is your Bake & Grill code', $login->subject);

        $reset = new CustomerOtpMail('482913', 10, 'reset_password', '+9607820288');
        $reset->build();
        $this->assertSame('482913 is your Bake & Grill password reset code', $reset->subject);

        $html = $reset->render();
        $this->assertStringContainsString('Your password reset code', $html);
        $this->assertStringContainsString('your password has not changed', $html);
        $this->assertStringNotContainsString('Your sign-in code', $html);
    }

    public function test_the_code_email_names_the_account_masked_and_the_times(): void
    {
        $this->travelTo(Carbon::parse('2026-10-06 05:13:00', 'UTC'));
        $html = (new CustomerOtpMail('718894', 10, 'register', '+9607820288'))->render();

        $this->assertStringContainsString('+960 782 ••88', $html);
        $this->assertStringNotContainsString('7820288', $html);
        $this->assertStringContainsString('Works until <strong style="color:#1C1408;">10:23 am</strong>', $html);
        $this->assertStringContainsString('6 Oct 2026, 10:13 am Malé time', $html);
        $this->assertStringContainsString('staff will never ask for it', $html);
        // The inbox preview line carries the code too.
        $this->assertMatchesRegularExpression('/display:none[^>]*>\s*Use 718894 to sign in\./', $html);
    }

    public function test_only_the_automatic_copy_says_the_code_also_went_by_sms(): void
    {
        $copy = (new CustomerOtpMail('718894', 10, 'register', '+9607820288', alsoTexted: true))->render();
        $only = (new CustomerOtpMail('718894', 10, 'register', '+9607820288'))->render();

        $this->assertStringContainsString('same code was sent to your phone by SMS', $copy);
        $this->assertStringNotContainsString('same code was sent to your phone by SMS', $only);
    }

    public function test_the_code_email_has_a_plain_text_part(): void
    {
        config(['mail.default' => 'array']);
        Mail::to('owner@example.org')->send(new CustomerOtpMail('718894', 10, 'register', '+9607820288'));

        $sent = app('mailer')->getSymfonyTransport()->messages()->first()->getOriginalMessage();
        $text = (string) $sent->getTextBody();
        $this->assertStringContainsString('718894', $text);
        $this->assertStringContainsString('+960 782 ••88', $text);
        $this->assertStringNotContainsString('<td', $text);
    }

    public function test_every_customer_email_carries_the_brand_and_contact_details(): void
    {
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_whatsapp', 'https://wa.me/9609120011');

        $req = new CateringRequest(['reference' => 'EV-1', 'contact_name' => 'Ahmed', 'quote_payment_laar' => 1000]);
        $req->setRelation('lines', collect([new CateringRequestLine(['name' => 'Tray', 'quantity' => 2, 'unit_price' => 325.5])]));
        $card = new GiftCard(['initial_balance' => 250]);

        $mails = [
            new CustomerOtpMail('123456'),
            new GiftCardMail($card, 'ABCD-1234', 'https://example.test/redeem'),
            new EventRequestReceivedMail($req, 'Ahmed'),
            new EventQuoteSentMail($req, 'https://example.test/q', ['subtotal_laar' => 65100, 'tax_laar' => 11067, 'total_laar' => 76167]),
            new EventConfirmedMail($req, 1000, 0),
        ];

        foreach ($mails as $mail) {
            $html = $mail->render();
            $name = class_basename($mail);
            $this->assertStringContainsString('Bake &amp; Grill', $html, $name);
            $this->assertStringContainsString('https://wa.me/9609120011', $html, $name);
            $this->assertStringContainsString('tel:+9609120011', $html, $name);
            $this->assertStringContainsString('<meta name="color-scheme" content="light">', $html, $name);
            // The default Laravel markdown look is gone.
            $this->assertStringNotContainsString('Laravel', $html, $name);
        }
    }

    public function test_quote_lines_are_priced_in_mvr_without_rounding_errors(): void
    {
        $req = new CateringRequest(['reference' => 'EV-1', 'quote_payment_laar' => 1000]);
        $req->setRelation('lines', collect([new CateringRequestLine(['name' => 'Tray', 'quantity' => 3, 'unit_price' => 0.29])]));

        $html = (new EventQuoteSentMail($req, 'https://example.test/q', ['subtotal_laar' => 87, 'tax_laar' => 0, 'total_laar' => 87]))->render();

        $this->assertStringContainsString('MVR 0.29 each', $html);
        $this->assertStringContainsString('MVR 0.87', $html);
    }

    public function test_the_logo_is_embedded_in_the_sent_message_and_small(): void
    {
        config(['mail.default' => 'array']);
        Mail::to('owner@example.org')->send(new CustomerOtpMail('123456'));

        $sent = app('mailer')->getSymfonyTransport()->messages()->first()->getOriginalMessage();
        $inline = array_values(array_filter($sent->getAttachments(), fn ($part) => $part->getDisposition() === 'inline'));
        $this->assertCount(1, $inline);
        $this->assertStringContainsString('src="cid:', (string) $sent->getHtmlBody());
        $this->assertLessThan(40_000, strlen($inline[0]->getBody()));
    }

    public function test_masked_phone(): void
    {
        $this->assertSame('+960 782 ••88', EmailBrand::maskPhone('+9607820288'));
        $this->assertSame('+960 782 ••88', EmailBrand::maskPhone('7820288'));
        $this->assertNull(EmailBrand::maskPhone(null));
        $this->assertNull(EmailBrand::maskPhone('12'));
    }
}
