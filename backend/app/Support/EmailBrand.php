<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\SiteSetting;
use Throwable;

/**
 * Brand values for customer emails (resources/views/emails/layout.blade.php).
 *
 * Owner, 2026-10-06: "Enhance the email send with branding". Every email
 * shares one look: the logo in a cream circle on the rust band, the
 * business's own contact details in the footer, all from Site settings so
 * a change there reaches the emails too.
 */
final class EmailBrand
{
    /** @return array<string, string|null> */
    public static function variables(): array
    {
        $name = (string) SiteSetting::get('site_name', config('business.name', 'Bake & Grill'));
        $phone = (string) SiteSetting::get('business_phone', config('business.phone', ''));
        $whatsapp = (string) SiteSetting::get('business_whatsapp', config('business.social.whatsapp', ''));

        return [
            'name' => $name,
            'tagline' => (string) SiteSetting::get('site_tagline', 'Fresh grills & baked favourites'),
            'primary' => self::hex((string) SiteSetting::get('primary_color', '#B74B0C'), '#B74B0C'),
            'phone' => $phone !== '' ? $phone : null,
            'phoneHref' => $phone !== '' ? 'tel:' . preg_replace('/[^\d+]/', '', $phone) : null,
            'whatsappUrl' => str_starts_with($whatsapp, 'http') ? $whatsapp : null,
            'email' => (string) SiteSetting::get('business_email', config('business.email', '')) ?: null,
            'address' => (string) SiteSetting::get('business_address', config('business.address.full', 'Malé, Maldives')) ?: null,
            'websiteUrl' => rtrim((string) config('app.url'), '/'),
            'orderUrl' => rtrim((string) config('app.url'), '/') . '/order',
            'logoUrl' => self::absolute((string) SiteSetting::get('logo', '/logo.png')),
            'logoPath' => self::logoForEmail(),
        ];
    }

    /**
     * A small copy of the site logo to embed in the message, so it shows
     * even where the mail app blocks remote pictures. The 1080px original
     * would add ~100 KB to every email; this is a few KB.
     */
    public static function logoForEmail(): ?string
    {
        $source = self::localLogo();
        if ($source === null) {
            return null;
        }

        try {
            $target = storage_path('app/email/logo-' . md5($source . '|' . filemtime($source)) . '.png');
            if (is_file($target)) {
                return $target;
            }
            if (!function_exists('imagecreatefromstring')) {
                return $source;
            }
            $img = @imagecreatefromstring((string) file_get_contents($source));
            if ($img === false) {
                return $source;
            }
            $w = imagesx($img);
            $h = imagesy($img);
            $size = 200;
            $scale = min(1, $size / max($w, $h));
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $out = imagecreatetruecolor($nw, $nh);
            imagealphablending($out, false);
            imagesavealpha($out, true);
            imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
            imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            @mkdir(dirname($target), 0775, true);
            imagepng($out, $target, 9);
            imagedestroy($img);
            imagedestroy($out);

            return is_file($target) ? $target : $source;
        } catch (Throwable) {
            return $source;
        }
    }

    /** "+9607820288" → "+960 782 ••88"; null when there is no number. */
    public static function maskPhone(?string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $phone) ?? '';
        $local = substr($digits, -7);
        if (strlen($local) !== 7) {
            return null;
        }

        return '+960 ' . substr($local, 0, 3) . ' ••' . substr($local, -2);
    }

    private static function localLogo(): ?string
    {
        $logo = (string) SiteSetting::get('logo', '/logo.png');
        $path = parse_url($logo, PHP_URL_PATH);
        foreach ([is_string($path) ? public_path(ltrim($path, '/')) : null, public_path('logo.png')] as $candidate) {
            if ($candidate !== null && is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private static function absolute(string $url): string
    {
        if ($url === '' || preg_match('#^https?://#i', $url)) {
            return $url !== '' ? $url : url('/logo.png');
        }

        return url('/' . ltrim($url, '/'));
    }

    private static function hex(string $value, string $fallback): string
    {
        return preg_match('/^#[0-9a-f]{6}$/i', trim($value)) ? strtoupper(trim($value)) : $fallback;
    }
}
