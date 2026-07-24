<?php

declare(strict_types=1);

namespace App\Domains\Media\Services;

use App\Models\ItemPhoto;
use App\Models\Media;
use App\Models\User;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MediaFileCleaner;
use App\Support\MenuImageValidation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Catalog + upload + reconcile for the central media library.
 */
final class MediaLibraryService
{
    /** @var list<string> */
    public const SCAN_PREFIXES = [
        'menu/',
        'menu-banners/',
        'menu-masters/',
        'thumbs/',
        'item-photos/',
        'item_photos/',
        'content/',
        'site/',
        'library/',
    ];

    /** Derived path fragments that should not become primary catalog rows. */
    private const DERIVED_MARKERS = [
        '/thumbs/',
        '/masters/',
        '/posters/',
        'menu-masters/',
        'thumbs/',
    ];

    public function __construct(
        private readonly MenuImageProcessor $images,
    ) {}

    /**
     * Register an existing public-disk path into the catalog (idempotent).
     */
    public function registerPath(
        string $path,
        string $source = 'other',
        ?User $uploader = null,
        ?string $title = null,
        ?string $thumbUrl = null,
        ?string $originalUrl = null,
    ): ?Media {
        $path = ltrim($path, '/');
        if ($path === '' || $this->isDerivedPath($path)) {
            return null;
        }

        $existing = Media::query()->where('path', $path)->first();
        if ($existing) {
            return $existing;
        }

        $disk = Storage::disk('public');
        if (!$disk->exists($path)) {
            return null;
        }

        $absolute = $disk->path($path);
        $mime = $this->guessMime($absolute, $path);
        $type = $this->mediaTypeFromMime($mime);
        if ($type === null) {
            return null;
        }

        $checksum = @hash_file('sha256', $absolute) ?: null;
        if ($checksum) {
            $byChecksum = Media::query()->where('checksum', $checksum)->first();
            if ($byChecksum) {
                return $byChecksum;
            }
        }

        [$width, $height] = $type === 'image' ? $this->imageSize($absolute) : [null, null];

        $resolvedThumb = $thumbUrl;
        if ($type === 'image') {
            $resolvedThumb = $this->resolveImageThumbUrl($path, $thumbUrl);
        } elseif (is_string($thumbUrl) && $thumbUrl !== '') {
            $resolvedThumb = $this->toStorageUrl($thumbUrl);
        }

        return Media::create([
            'disk' => 'public',
            'path' => $path,
            'media_type' => $type,
            'mime_type' => $mime,
            'file_size' => (int) (@filesize($absolute) ?: 0),
            'width' => $width,
            'height' => $height,
            'thumb_url' => $resolvedThumb,
            'original_url' => $originalUrl ? $this->toStorageUrl($originalUrl) : null,
            'title' => $title ?: pathinfo($path, PATHINFO_FILENAME),
            'source' => $source,
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ]);
    }

    /**
     * Walk known folders + item_photos and upsert catalog rows.
     *
     * @return array{scanned: int, created: int, skipped: int, thumbs_fixed: int}
     */
    public function reconcile(): array
    {
        $disk = Storage::disk('public');
        $scanned = 0;
        $created = 0;
        $skipped = 0;

        foreach (self::SCAN_PREFIXES as $prefix) {
            if (!$disk->exists(rtrim($prefix, '/'))) {
                continue;
            }
            foreach ($disk->allFiles(rtrim($prefix, '/')) as $path) {
                $scanned++;
                if ($this->isDerivedPath($path)) {
                    $skipped++;
                    continue;
                }
                $before = Media::query()->where('path', $path)->exists();
                $row = $this->registerPath($path, $this->sourceFromPath($path));
                if ($row && !$before) {
                    $created++;
                } else {
                    $skipped++;
                }
            }
        }

        // Link gallery rows that may live outside scanned prefixes.
        ItemPhoto::query()->orderBy('id')->chunkById(100, function ($photos) use (&$scanned, &$created) {
            foreach ($photos as $photo) {
                $path = MediaFileCleaner::storagePathFromUrl((string) $photo->url);
                if ($path === null) {
                    continue;
                }
                $scanned++;
                $before = Media::query()->where('path', $path)->exists();
                $row = $this->registerPath(
                    $path,
                    'gallery',
                    null,
                    $photo->alt_text,
                    $photo->thumb_url ?? $photo->poster_url,
                    $photo->original_url,
                );
                if ($row && !$before) {
                    $created++;
                }
            }
        });

        $thumbsFixed = $this->backfillMissingThumbs();

        return [
            'scanned' => $scanned,
            'created' => $created,
            'skipped' => $skipped,
            'thumbs_fixed' => $thumbsFixed,
        ];
    }

    /**
     * Fill thumb_url for image rows that are still null (idempotent).
     */
    public function backfillMissingThumbs(): int
    {
        $updated = 0;
        Media::query()
            ->where('media_type', 'image')
            ->where(function ($q) {
                $q->whereNull('thumb_url')->orWhere('thumb_url', '');
            })
            ->orderBy('id')
            ->chunkById(100, function ($rows) use (&$updated) {
                foreach ($rows as $row) {
                    $path = (string) $row->path;
                    if ($path === '') {
                        continue;
                    }
                    $row->thumb_url = $this->resolveImageThumbUrl($path, null);
                    $row->save();
                    $updated++;
                }
            });

        return $updated;
    }

    /**
     * Prefer sibling thumbs/<basename> when present; else the image itself.
     * Always returns a domain-relative /storage/... URL.
     */
    public function resolveImageThumbUrl(string $path, ?string $thumbUrl = null): string
    {
        if (is_string($thumbUrl) && trim($thumbUrl) !== '') {
            return $this->toStorageUrl($thumbUrl) ?? ('/storage/' . ltrim($path, '/'));
        }

        $path = ltrim($path, '/');
        $disk = Storage::disk('public');
        $basename = basename($path);
        $dir = dirname($path);
        $candidates = [];
        if ($dir !== '.' && $dir !== '') {
            $candidates[] = $dir . '/thumbs/' . $basename;
        }
        $candidates[] = 'thumbs/' . $basename;

        foreach ($candidates as $candidate) {
            if ($disk->exists($candidate)) {
                return '/storage/' . ltrim($candidate, '/');
            }
        }

        return '/storage/' . $path;
    }

    /** Normalize absolute or relative media URLs to /storage/... */
    public function toStorageUrl(?string $urlOrPath): ?string
    {
        if ($urlOrPath === null) {
            return null;
        }
        $urlOrPath = trim($urlOrPath);
        if ($urlOrPath === '') {
            return null;
        }
        if (str_starts_with($urlOrPath, '/storage/')) {
            return $urlOrPath;
        }
        if (preg_match('#https?://[^/]+(/storage/.+)$#', $urlOrPath, $m) === 1) {
            return $m[1];
        }
        if (str_starts_with($urlOrPath, 'storage/')) {
            return '/' . $urlOrPath;
        }

        return '/storage/' . ltrim($urlOrPath, '/');
    }

    /**
     * Store one uploaded file into the library (with checksum dedupe).
     *
     * @param  list<int>  $collectionIds
     * @return array{asset: Media, deduped: bool}
     */
    public function storeUpload(
        UploadedFile $file,
        ?User $uploader = null,
        array $collectionIds = [],
        ?string $title = null,
        ?string $altText = null,
    ): array {
        $mime = (string) ($file->getMimeType() ?: '');
        $type = $this->mediaTypeFromMime($mime);
        if ($type === null) {
            abort(422, 'Unsupported media type.');
        }

        $checksum = hash_file('sha256', $file->getRealPath() ?: $file->getPathname());
        $existing = Media::query()->where('checksum', $checksum)->first();
        if ($existing) {
            if ($collectionIds !== []) {
                $existing->collections()->syncWithoutDetaching($collectionIds);
            }

            return ['asset' => $existing->fresh(['collections']), 'deduped' => true];
        }

        $asset = match ($type) {
            'image' => $this->storeImage($file, $uploader, $title, $altText, $checksum),
            'video' => $this->storeVideo($file, $uploader, $title, $altText, $checksum),
            'audio' => $this->storeBinary($file, 'audio', 'library/audio', $uploader, $title, $altText, $checksum, 20 * 1024),
            'document' => $this->storeBinary($file, 'document', 'library/documents', $uploader, $title, $altText, $checksum, 20 * 1024),
            default => abort(422, 'Unsupported media type.'),
        };

        if ($collectionIds !== []) {
            $asset->collections()->sync($collectionIds);
        }

        return ['asset' => $asset->fresh(['collections']), 'deduped' => false];
    }

    public function mediaTypeFromMime(string $mime): ?string
    {
        $mime = strtolower(trim($mime));
        if (str_starts_with($mime, 'image/')) {
            return 'image';
        }
        if (in_array($mime, ['video/mp4', 'video/webm', 'video/quicktime'], true)) {
            return 'video';
        }
        if (in_array($mime, ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'], true)) {
            return 'audio';
        }
        if ($mime === 'application/pdf') {
            return 'document';
        }

        return null;
    }

    private function storeImage(
        UploadedFile $file,
        ?User $uploader,
        ?string $title,
        ?string $altText,
        string $checksum,
    ): Media {
        $allowed = MenuImageValidation::allowedMimeTypes();
        if (!in_array((string) $file->getMimeType(), $allowed, true)) {
            if (MenuImageValidation::looksLikeHeic($file)) {
                abort(422, MenuImageValidation::heicRejectedMessage());
            }
            if ($file->getMimeType() === 'image/webp' && !ImageCapabilities::supportsWebp()) {
                abort(422, MenuImageValidation::webpUnsupportedMessage());
            }
            abort(422, 'Unsupported image type.');
        }

        $dir = 'library/images';
        $path = $this->images->storeProcessed($file, $dir);
        $thumbPath = $this->images->storeThumbnail($file, $dir . '/thumbs');
        $masterPath = $this->images->storeMaster($file, $dir . '/masters');
        $absolute = Storage::disk('public')->path($path);
        [$width, $height] = $this->imageSize($absolute);

        return Media::create([
            'disk' => 'public',
            'path' => $path,
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => (int) (@filesize($absolute) ?: 0),
            'width' => $width,
            'height' => $height,
            'thumb_url' => '/storage/' . ltrim($thumbPath, '/'),
            'original_url' => '/storage/' . ltrim($masterPath, '/'),
            'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'alt_text' => $altText,
            'source' => 'library',
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ]);
    }

    private function storeVideo(
        UploadedFile $file,
        ?User $uploader,
        ?string $title,
        ?string $altText,
        string $checksum,
    ): Media {
        if ($file->getSize() > 50 * 1024 * 1024) {
            abort(422, 'Video must be 50 MB or smaller.');
        }
        $mime = strtolower((string) ($file->getMimeType() ?: ''));
        $ext = strtolower($file->getClientOriginalExtension() ?: '');
        $allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime'];
        $allowedExts = ['mp4', 'webm', 'mov'];

        if (!in_array($ext, $allowedExts, true)) {
            $ext = match (true) {
                str_contains($mime, 'webm') => 'webm',
                str_contains($mime, 'quicktime') => 'mov',
                str_contains($mime, 'mp4') => 'mp4',
                default => '',
            };
        }

        if (!in_array($mime, $allowedMimes, true) && !in_array($ext, $allowedExts, true)) {
            abort(422, 'Video must be mp4, webm, or mov.');
        }
        if (!in_array($ext, $allowedExts, true)) {
            abort(422, 'Video must be mp4, webm, or mov.');
        }

        $dir = 'library/video';
        $path = $this->images->storeRaw($file, $dir, $ext);
        $absolute = Storage::disk('public')->path($path);
        // Frame extract from .mov isn't available under GD — use a generic poster instead of failing.
        $thumbUrl = $this->genericVideoPosterThumb() ?: null;

        return Media::create([
            'disk' => 'public',
            'path' => $path,
            'media_type' => 'video',
            'mime_type' => (string) ($file->getMimeType() ?: ($ext === 'mov' ? 'video/quicktime' : 'video/' . $ext)),
            'file_size' => (int) (@filesize($absolute) ?: 0),
            'thumb_url' => $thumbUrl,
            'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'alt_text' => $altText,
            'source' => 'library',
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ]);
    }

    /**
     * GD cannot extract frames from .mov — store a simple poster so uploads never fail.
     */
    private function genericVideoPosterThumb(): string
    {
        $img = imagecreatetruecolor(400, 300);
        if ($img === false) {
            return '';
        }
        $bg = imagecolorallocate($img, 45, 45, 48);
        $fg = imagecolorallocate($img, 220, 220, 220);
        if ($bg !== false) {
            imagefilledrectangle($img, 0, 0, 400, 300, $bg);
        }
        if ($fg !== false) {
            imagefilledpolygon($img, [160, 100, 160, 200, 260, 150], $fg);
        }
        ob_start();
        imagejpeg($img, null, 80);
        $binary = (string) ob_get_clean();
        imagedestroy($img);
        if ($binary === '') {
            return '';
        }
        $relative = 'library/video/posters/' . \Illuminate\Support\Str::uuid()->toString() . '.jpg';
        Storage::disk('public')->put($relative, $binary);

        return '/storage/' . $relative;
    }

    private function storeBinary(
        UploadedFile $file,
        string $type,
        string $dir,
        ?User $uploader,
        ?string $title,
        ?string $altText,
        string $checksum,
        int $maxKb,
    ): Media {
        if ($file->getSize() > $maxKb * 1024) {
            abort(422, strtoupper($type) . ' must be ' . (int) ($maxKb / 1024) . ' MB or smaller.');
        }
        $ext = strtolower($file->getClientOriginalExtension() ?: ($type === 'document' ? 'pdf' : 'mp3'));
        $path = $this->images->storeRaw($file, $dir, $ext);
        $absolute = Storage::disk('public')->path($path);

        return Media::create([
            'disk' => 'public',
            'path' => $path,
            'media_type' => $type,
            'mime_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'),
            'file_size' => (int) (@filesize($absolute) ?: 0),
            'thumb_url' => null,
            'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'alt_text' => $altText,
            'source' => 'library',
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ]);
    }

    public function isDerivedPath(string $path): bool
    {
        $path = str_replace('\\', '/', $path);
        if (str_starts_with($path, 'menu-masters/') || str_starts_with($path, 'thumbs/')) {
            return true;
        }
        foreach (['/thumbs/', '/masters/', '/posters/'] as $marker) {
            if (str_contains($path, $marker)) {
                return true;
            }
        }

        return false;
    }

    private function sourceFromPath(string $path): string
    {
        if (str_starts_with($path, 'menu-banners/')) {
            return 'banner';
        }
        if (str_starts_with($path, 'menu/')) {
            return 'menu';
        }
        if (str_starts_with($path, 'item-photos/') || str_starts_with($path, 'item_photos/')) {
            return 'gallery';
        }
        if (str_starts_with($path, 'site/') || str_starts_with($path, 'content/')) {
            return 'content';
        }
        if (str_starts_with($path, 'library/')) {
            return 'library';
        }

        return 'other';
    }

    private function guessMime(string $absolute, string $path): string
    {
        $mime = @mime_content_type($absolute) ?: '';
        if ($mime !== '') {
            return $mime;
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return match ($ext) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'mp4' => 'video/mp4',
            'webm' => 'video/webm',
            'mov' => 'video/quicktime',
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'pdf' => 'application/pdf',
            default => 'application/octet-stream',
        };
    }

    /** @return array{0: ?int, 1: ?int} */
    private function imageSize(string $absolute): array
    {
        $info = @getimagesize($absolute);
        if (!is_array($info)) {
            return [null, null];
        }

        return [(int) ($info[0] ?? 0) ?: null, (int) ($info[1] ?? 0) ?: null];
    }
}
