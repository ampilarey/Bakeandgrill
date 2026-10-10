<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\Media;
use App\Services\MenuImageProcessor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The logo, the dark-background logo, the browser tab icon and the link
 * preview, each saved in the shape it is shown in (owner, 2026-10-10: "Fix").
 *
 * They went through the menu-photo path like every other picture, which cuts
 * to 4:3 from the middle and flattens onto white: a wide see-through logo
 * came out as a white box holding its middle third, a square icon lost its
 * top and bottom, a 1200×630 preview lost its sides.
 *
 *  - logo, logo_dark: the whole picture, see-through parts kept, PNG, no
 *    wider or taller than LOGO_MAX_EDGE.
 *  - favicon: centred on a clear square, PNG, ICON_MAX_EDGE at most.
 *  - og_image: PREVIEW_WIDTH × PREVIEW_HEIGHT, the shape link previews use,
 *    trimmed from the middle when the picture is another shape; JPEG.
 *
 * Every write of these keys passes through normalize() (from
 * ContentValidationService::normalizeForWrite), so a picture chosen from the
 * Media Library in Business Details or set with "Use as" is redrawn from the
 * library's full-size master the same way an upload is.
 */
final class BrandImages
{
    public const LOGO_MAX_EDGE = 1200;

    public const ICON_MAX_EDGE = 512;

    public const PREVIEW_WIDTH = 1200;

    public const PREVIEW_HEIGHT = 630;

    public const PREVIEW_JPEG_QUALITY = 85;

    /** On the public disk; one folder per kind. */
    public const DIRECTORY = 'site/brand';

    public const SOURCE = 'brand';

    /** @var array<string, 'logo'|'icon'|'preview'> */
    private const KINDS = [
        'logo' => 'logo',
        'logo_dark' => 'logo',
        'favicon' => 'icon',
        'og_image' => 'preview',
    ];

    private const TITLES = [
        'logo' => 'Logo',
        'logo_dark' => 'Logo for dark backgrounds',
        'favicon' => 'Browser tab icon',
        'og_image' => 'Link preview',
    ];

    public function __construct(
        private readonly MenuImageProcessor $images,
    ) {}

    public static function handles(string $key): bool
    {
        return isset(self::KINDS[$key]);
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::KINDS);
    }

    /**
     * Draw the rendition straight from an uploaded file.
     *
     * @throws RuntimeException when the file is not a picture we can read
     */
    public function fromUpload(string $key, UploadedFile $file): Media
    {
        $this->assertHandles($key);

        return $this->render($key, $file);
    }

    /**
     * The value to store for a brand key.
     *
     * One of our own stored pictures that is not already this key's rendition
     * is redrawn, from the Media Library master when it has one (the whole
     * frame, see-through parts intact for a PNG uploaded since 2026-10-10).
     * Anything else stays as it is: blank (the built-in file), a shipped file
     * such as /brand/logo-light.png, an address on another site, and a stored
     * file that is missing or will not decode, which is left for the page's
     * own fallbacks rather than refusing the whole save.
     */
    public function normalize(string $key, string $value): string
    {
        if (!self::handles($key)) {
            return $value;
        }

        $relative = self::storagePath($value);
        if ($relative === null || $this->isRendition($key, $relative)) {
            return $value;
        }

        $source = $this->sourceFile($relative);
        if ($source === null) {
            return $value;
        }

        try {
            return $this->render($key, new UploadedFile($source, basename($source), null, null, true))->url;
        } catch (RuntimeException $e) {
            Log::warning('Brand picture could not be redrawn; kept as chosen', [
                'key' => $key,
                'value' => $value,
                'error' => $e->getMessage(),
            ]);

            return $value;
        }
    }

    /**
     * Is this stored path already a rendition made for this key? Drawn here
     * means a brand row with no master. Replacing that row's file in the
     * Media Library writes the library's 4:3 crop beside it and gives the row
     * a master; that is not a rendition, and is redrawn from the master.
     */
    public function isRendition(string $key, string $relative): bool
    {
        $relative = ltrim($relative, '/');
        if (!self::handles($key) || !str_starts_with($relative, self::DIRECTORY . '/' . self::KINDS[$key] . '/')) {
            return false;
        }

        return Media::query()
            ->where('path', $relative)
            ->where('source', self::SOURCE)
            ->whereNull('original_url')
            ->exists();
    }

    /**
     * The public-disk path a value names, when it names one of our stored
     * files: "/storage/x/y.png", with or without our own host and a query.
     */
    public static function storagePath(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $value) === 1) {
            $host = parse_url($value, PHP_URL_HOST);
            $ownHost = parse_url((string) config('app.url'), PHP_URL_HOST);
            if (!is_string($host) || !is_string($ownHost) || strcasecmp($host, $ownHost) !== 0) {
                return null;
            }
        }

        $path = rawurldecode((string) (parse_url($value, PHP_URL_PATH) ?: ''));
        if (!str_starts_with($path, '/storage/')) {
            return null;
        }

        $relative = substr($path, strlen('/storage/'));
        if ($relative === '' || in_array('..', explode('/', $relative), true)) {
            return null;
        }

        return $relative;
    }

    /**
     * The best file to draw from: the Media Library master of the chosen
     * picture when there is one, else the stored file itself.
     */
    private function sourceFile(string $relative): ?string
    {
        $url = '/storage/' . $relative;
        $media = Media::query()
            ->where('path', $relative)
            ->orWhere('original_url', $url)
            ->orderByRaw('CASE WHEN path = ? THEN 0 ELSE 1 END', [$relative])
            ->first();

        $master = $media !== null ? self::storagePath((string) $media->original_url) : null;
        if ($master !== null && ($file = self::absolute($master)) !== null) {
            return $file;
        }

        return self::absolute($relative);
    }

    /**
     * Where a public-disk path lives. Pictures written through the disk and
     * through storage_path() are the same folder in production; under a faked
     * disk in tests they are not, so both are tried.
     */
    private static function absolute(string $relative): ?string
    {
        foreach ([
            Storage::disk('public')->path($relative),
            storage_path('app/public/' . $relative),
        ] as $candidate) {
            if (is_file($candidate) && is_readable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function render(string $key, UploadedFile $file): Media
    {
        $isJpeg = str_contains(strtolower((string) $file->getMimeType()), 'jpeg');
        $image = $this->images->decode($file);

        try {
            [$bytes, $extension, $width, $height] = match (self::KINDS[$key]) {
                'logo' => $this->drawLogo($image, $isJpeg),
                'icon' => $this->drawIcon($image),
                'preview' => $this->drawPreview($image),
            };
        } finally {
            imagedestroy($image);
        }

        return $this->store($key, $bytes, $extension, $width, $height);
    }

    /**
     * A see-through logo stays a PNG. A photographed one (a JPEG with nothing
     * see-through) stays a JPEG: as a PNG it would be megabytes, and the
     * printable menu and the emails leave out a logo file that large.
     *
     * @return array{0: string, 1: string, 2: int, 3: int}
     */
    private function drawLogo(\GdImage $image, bool $fromJpeg): array
    {
        [$w, $h] = [imagesx($image), imagesy($image)];
        $scale = min(1.0, self::LOGO_MAX_EDGE / max($w, $h));
        $tw = max(1, (int) round($w * $scale));
        $th = max(1, (int) round($h * $scale));

        $out = self::clearCanvas($tw, $th);
        imagecopyresampled($out, $image, 0, 0, 0, 0, $tw, $th, $w, $h);

        if ($fromJpeg && !MenuImageProcessor::hasTransparency($out)) {
            ob_start();
            imagejpeg($out, null, 90);
            $jpeg = (string) ob_get_clean();
            imagedestroy($out);
            if ($jpeg === '') {
                throw new RuntimeException('Could not encode the logo.');
            }

            return [$jpeg, 'jpg', $tw, $th];
        }

        return [self::png($out), 'png', $tw, $th];
    }

    /** @return array{0: string, 1: string, 2: int, 3: int} */
    private function drawIcon(\GdImage $image): array
    {
        [$w, $h] = [imagesx($image), imagesy($image)];
        $side = min(self::ICON_MAX_EDGE, max($w, $h));
        $scale = $side / max($w, $h);
        $tw = max(1, (int) round($w * $scale));
        $th = max(1, (int) round($h * $scale));

        $out = self::clearCanvas($side, $side);
        imagecopyresampled($out, $image, intdiv($side - $tw, 2), intdiv($side - $th, 2), 0, 0, $tw, $th, $w, $h);

        return [self::png($out), 'png', $side, $side];
    }

    /** @return array{0: string, 1: string, 2: int, 3: int} */
    private function drawPreview(\GdImage $image): array
    {
        [$w, $h] = [imagesx($image), imagesy($image)];
        $target = self::PREVIEW_WIDTH / self::PREVIEW_HEIGHT;
        if ($w / $h > $target) {
            $cropH = $h;
            $cropW = max(1, (int) round($h * $target));
            $x = intdiv($w - $cropW, 2);
            $y = 0;
        } else {
            $cropW = $w;
            $cropH = max(1, (int) round($w / $target));
            $x = 0;
            $y = intdiv($h - $cropH, 2);
        }

        $out = imagecreatetruecolor(self::PREVIEW_WIDTH, self::PREVIEW_HEIGHT);
        if ($out === false) {
            throw new RuntimeException('Could not allocate image canvas.');
        }
        // Crawlers want an opaque picture; see-through parts go onto white.
        imagefill($out, 0, 0, (int) imagecolorallocate($out, 255, 255, 255));
        imagecopyresampled($out, $image, 0, 0, $x, $y, self::PREVIEW_WIDTH, self::PREVIEW_HEIGHT, $cropW, $cropH);

        ob_start();
        imagejpeg($out, null, self::PREVIEW_JPEG_QUALITY);
        $jpeg = (string) ob_get_clean();
        imagedestroy($out);
        if ($jpeg === '') {
            throw new RuntimeException('Could not encode the link preview.');
        }

        return [$jpeg, 'jpg', self::PREVIEW_WIDTH, self::PREVIEW_HEIGHT];
    }

    private static function clearCanvas(int $w, int $h): \GdImage
    {
        $out = imagecreatetruecolor($w, $h);
        if ($out === false) {
            throw new RuntimeException('Could not allocate image canvas.');
        }
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagefill($out, 0, 0, (int) imagecolorallocatealpha($out, 0, 0, 0, 127));

        return $out;
    }

    private static function png(\GdImage $out): string
    {
        ob_start();
        imagepng($out, null, 9);
        $png = (string) ob_get_clean();
        imagedestroy($out);
        if ($png === '') {
            throw new RuntimeException('Could not encode the picture.');
        }

        return $png;
    }

    /**
     * Saved once per distinct picture: the same logo chosen again, or for
     * both logo slots, reuses the file it already made.
     */
    private function store(string $key, string $bytes, string $extension, int $width, int $height): Media
    {
        $folder = self::DIRECTORY . '/' . self::KINDS[$key] . '/';
        $checksum = hash('sha256', $bytes);
        $disk = Storage::disk('public');

        $existing = Media::query()
            ->where('source', self::SOURCE)
            ->where('checksum', $checksum)
            ->where('path', 'like', $folder . '%')
            ->whereNull('original_url')
            ->first();
        if ($existing !== null && $disk->exists((string) $existing->path)) {
            return $existing;
        }

        $relative = $folder . Str::uuid()->toString() . '.' . $extension;
        if (!$disk->put($relative, $bytes)) {
            throw new RuntimeException('Could not save the picture.');
        }

        return Media::query()->create([
            'disk' => 'public',
            'path' => $relative,
            'media_type' => 'image',
            'mime_type' => $extension === 'png' ? 'image/png' : 'image/jpeg',
            'file_size' => strlen($bytes),
            'width' => $width,
            'height' => $height,
            'title' => self::TITLES[$key],
            'source' => self::SOURCE,
            'checksum' => $checksum,
            'uploaded_by' => auth()->id(),
        ]);
    }

    private function assertHandles(string $key): void
    {
        if (!self::handles($key)) {
            throw new RuntimeException("{$key} is not a brand picture.");
        }
    }
}
