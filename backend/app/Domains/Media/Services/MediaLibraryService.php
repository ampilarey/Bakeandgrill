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

    public function __construct(
        private readonly MenuImageProcessor $images,
        private readonly VideoProcessor $videos,
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
        ?string $imageWebpUrl = null,
        ?string $thumbWebpUrl = null,
    ): ?Media {
        $path = ltrim($path, '/');
        if ($path === '' || $this->isDerivedPath($path)) {
            return null;
        }

        $existing = Media::query()->where('path', $path)->first();
        if ($existing) {
            return $this->applyRegistrationMetadata(
                $existing,
                $source,
                $uploader,
                $title,
                $thumbUrl,
                $originalUrl,
                $imageWebpUrl,
                $thumbWebpUrl,
            );
        }

        $disk = Storage::disk('public');
        $absolute = $disk->exists($path)
            ? $disk->path($path)
            : storage_path('app/public/' . $path);
        if (!is_file($absolute)) {
            return null;
        }

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
            'image_webp_url' => $imageWebpUrl ? $this->toStorageUrl($imageWebpUrl) : null,
            'thumb_webp_url' => $thumbWebpUrl ? $this->toStorageUrl($thumbWebpUrl) : null,
            'original_url' => $originalUrl ? $this->toStorageUrl($originalUrl) : null,
            'title' => $title ?: pathinfo($path, PATHINFO_FILENAME),
            'source' => $source,
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ]);
    }

    private function applyRegistrationMetadata(
        Media $media,
        string $source,
        ?User $uploader,
        ?string $title,
        ?string $thumbUrl,
        ?string $originalUrl,
        ?string $imageWebpUrl,
        ?string $thumbWebpUrl,
    ): Media {
        $updates = [];

        if ($source !== '' && ($media->source === null || $media->source === '' || $media->source === 'other')) {
            $updates['source'] = $source;
        }
        if ($uploader && !$media->uploaded_by) {
            $updates['uploaded_by'] = $uploader->id;
        }
        if ($title && !$media->title) {
            $updates['title'] = $title;
        }
        if ($thumbUrl) {
            $updates['thumb_url'] = $this->toStorageUrl($thumbUrl);
        }
        if ($originalUrl) {
            $updates['original_url'] = $this->toStorageUrl($originalUrl);
        }
        if ($imageWebpUrl) {
            $updates['image_webp_url'] = $this->toStorageUrl($imageWebpUrl);
        }
        if ($thumbWebpUrl) {
            $updates['thumb_webp_url'] = $this->toStorageUrl($thumbWebpUrl);
        }

        if ($updates !== []) {
            $media->fill($updates)->save();
        }

        return $media->fresh();
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
        $processed = $this->images->storeProcessedPair($file, $dir);
        $thumb = $this->images->storeThumbnailPair($file, $dir . '/thumbs');
        $masterPath = $this->images->storeMaster($file, $dir . '/masters');
        $path = $processed['path'];
        $absolute = Storage::disk('public')->path($path);
        [$width, $height] = $this->imageSize($absolute);

        $attributes = [
            'disk' => 'public',
            'path' => $path,
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => (int) (@filesize($absolute) ?: 0),
            'width' => $width,
            'height' => $height,
            'thumb_url' => '/storage/' . ltrim($thumb['path'], '/'),
            'image_webp_url' => $processed['webp_path']
                ? '/storage/' . ltrim($processed['webp_path'], '/')
                : null,
            'thumb_webp_url' => $thumb['webp_path']
                ? '/storage/' . ltrim($thumb['webp_path'], '/')
                : null,
            'original_url' => '/storage/' . ltrim($masterPath, '/'),
            'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'alt_text' => $altText,
            'source' => 'library',
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ];

        // storeProcessedPair() may have already catalogued the primary path.
        $existing = Media::query()->where('path', $path)->first();
        if ($existing) {
            $existing->fill($attributes)->save();

            return $existing->fresh();
        }

        return Media::create($attributes);
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
        try {
            $safe = $this->videos->ensureWebSafe(Storage::disk('public')->path($path));
        } catch (\Throwable $e) {
            abort(422, $e->getMessage());
        }
        $path = $safe['relative_path'];
        $absolute = $safe['absolute_path'];
        // Frame extract from video isn't available under GD — use a generic poster instead of failing.
        $thumbUrl = $this->genericVideoPosterThumb() ?: null;

        $attributes = [
            'disk' => 'public',
            'path' => $path,
            'media_type' => 'video',
            'mime_type' => $safe['mime'],
            'file_size' => (int) (@filesize($absolute) ?: 0),
            'thumb_url' => $thumbUrl,
            'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'alt_text' => $altText,
            'source' => 'library',
            'checksum' => $checksum,
            'uploaded_by' => $uploader?->id,
        ];

        // storeRaw may have already catalogued the path (and ensureWebSafe remaps it).
        $existing = Media::query()->where('path', $path)->first();
        if ($existing) {
            $existing->fill($attributes)->save();

            return $existing->fresh();
        }

        return Media::create($attributes);
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

    /**
     * The extension a detected MIME type is allowed to be written as.
     *
     * Falls back to the type's canonical extension rather than to whatever the
     * uploader called the file — an unrecognised audio codec becomes `.mp3`,
     * not `.php`.
     */
    private function safeExtensionForMime(string $mime, string $type): string
    {
        return match (strtolower(trim($mime))) {
            'application/pdf' => 'pdf',
            'audio/mpeg', 'audio/mp3' => 'mp3',
            'audio/wav', 'audio/x-wav', 'audio/wave' => 'wav',
            default => $type === 'document' ? 'pdf' : 'mp3',
        };
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
        // Extension from the SNIFFED type, never from the uploaded filename.
        // A file named `invoice.php` whose bytes begin `%PDF-` passes the MIME
        // gate above and used to be stored as `<uuid>.php` under the public
        // disk — which the web server executes.
        $ext = $this->safeExtensionForMime((string) ($file->getMimeType() ?: ''), $type);
        $path = $this->images->storeRaw($file, $dir, $ext);
        $absolute = Storage::disk('public')->path($path);

        // updateOrCreate, not create: storeRaw() registers the path in the
        // catalog itself (MenuImageProcessor::registerInLibrary), and
        // media_assets.path is unique — so a plain insert here threw a
        // constraint violation and every PDF and audio upload failed with a
        // 500. The catalog row exists by now; this fills in the real type,
        // title and checksum that best-effort registration could not know.
        return Media::updateOrCreate(
            ['path' => $path],
            [
                'disk' => 'public',
                'media_type' => $type,
                'mime_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'),
                'file_size' => (int) (@filesize($absolute) ?: 0),
                'thumb_url' => null,
                'title' => $title ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
                'alt_text' => $altText,
                'source' => 'library',
                'checksum' => $checksum,
                'uploaded_by' => $uploader?->id,
            ],
        );
    }

    /**
     * Remove every disk file owned by this catalog row (primary, thumbs,
     * webp sidecars, masters, and edit-version backups). Call before delete().
     */
    public function purgeDiskFiles(Media $media): void
    {
        $disk = Storage::disk('public');
        $paths = [];

        if (is_string($media->path) && $media->path !== '') {
            $paths[] = ltrim($media->path, '/');
        }

        foreach ([
            $media->thumb_url,
            $media->original_url,
            $media->image_webp_url,
            $media->thumb_webp_url,
        ] as $url) {
            $resolved = MediaFileCleaner::storagePathFromUrl(is_string($url) ? $url : null);
            if (is_string($resolved) && $resolved !== '') {
                $paths[] = $resolved;
            }
        }

        $media->loadMissing('versions');
        foreach ($media->versions as $version) {
            $versionPath = is_string($version->path) ? ltrim($version->path, '/') : '';
            if ($versionPath !== '') {
                $paths[] = $versionPath;
            }
        }

        foreach (array_values(array_unique($paths)) as $path) {
            if ($disk->exists($path)) {
                $disk->delete($path);
            }
        }

        $versionDir = 'library/versions/' . (int) $media->id;
        if ($disk->exists($versionDir)) {
            $disk->deleteDirectory($versionDir);
        }
    }

    public function isDerivedPath(string $path): bool
    {
        $path = str_replace('\\', '/', ltrim($path, '/'));
        if (str_starts_with($path, 'menu-masters/') || str_starts_with($path, 'thumbs/')) {
            return true;
        }
        // Edit backups and processed WebP sidecars must never become primaries —
        // otherwise delete+reconcile resurrects "deleted" photos from leftovers.
        if (str_starts_with($path, 'library/versions/') || str_contains($path, '/versions/')) {
            return true;
        }
        if (str_ends_with(strtolower($path), '.webp')) {
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
