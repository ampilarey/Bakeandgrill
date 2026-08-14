<?php

declare(strict_types=1);

namespace App\Domains\Media\Services;

use App\Models\Media;
use App\Models\MediaAssetVersion;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MediaFileCleaner;
use App\Support\MenuImageValidation;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Image editing for Media Library assets (GD).
 */
final class MediaEditor
{
    public function __construct(
        private readonly MenuImageProcessor $images,
        private readonly MediaUsageResolver $usage,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $params
     * @return array{asset: Media, updated_references: int, mode: string}
     */
    public function edit(
        Media $asset,
        string $op,
        array $params,
        string $mode,
        ?User $actor = null,
        ?Request $request = null,
    ): array {
        if ($asset->media_type !== 'image' && !in_array($op, ['thumbnail', 'metadata'], true)) {
            abort(422, 'Editing tools are only available for images.');
        }

        $mode = $mode === 'copy' ? 'copy' : 'replace';
        $binary = $this->applyOp($asset, $op, $params);
        $ext = $binary['ext'];
        $mime = $binary['mime'];
        $contents = $binary['contents'];
        $width = $binary['width'];
        $height = $binary['height'];

        if ($mode === 'copy') {
            $dir = 'library/images';
            $newPath = $dir . '/' . Str::uuid()->toString() . '.' . $ext;
            Storage::disk('public')->put($newPath, $contents);
            $absolute = Storage::disk('public')->path($newPath);
            $copy = Media::create([
                'disk' => 'public',
                'path' => $newPath,
                'media_type' => 'image',
                'mime_type' => $mime,
                'file_size' => (int) (@filesize($absolute) ?: strlen($contents)),
                'width' => $width,
                'height' => $height,
                'thumb_url' => $asset->thumb_url,
                'original_url' => $asset->original_url,
                'title' => trim(($asset->title ?: 'Asset') . ' (edited)'),
                'alt_text' => $asset->alt_text,
                'tags' => $asset->tags,
                'source' => 'library',
                'checksum' => hash('sha256', $contents),
                'uploaded_by' => $actor?->id,
            ]);
            // Regenerate thumb for the copy.
            $this->writeThumbnailForPath($copy, $contents, $ext);

            $this->audit->log(
                'media.edited.copy',
                'Media',
                (int) $copy->id,
                [],
                ['op' => $op, 'from_id' => $asset->id, 'params' => $params],
                [],
                $request,
            );

            return ['asset' => $copy->fresh(['collections']), 'updated_references' => 0, 'mode' => 'copy'];
        }

        // Replace mode — backup current file, write new, rewrite refs if URL changes.
        $oldUrl = (string) $asset->url;
        $oldPath = (string) $asset->path;
        $this->backupVersion($asset);

        $dir = trim(dirname($oldPath), '.');
        if ($dir === '' || $dir === '/') {
            $dir = 'library/images';
        }
        $newPath = $dir . '/' . pathinfo($oldPath, PATHINFO_FILENAME) . '.' . $ext;
        // Prefer keeping same basename when extension unchanged.
        if (strtolower((string) pathinfo($oldPath, PATHINFO_EXTENSION)) === $ext) {
            $newPath = $oldPath;
        } else {
            // Different extension — write beside old, then delete old after rewrite.
            $newPath = $dir . '/' . Str::uuid()->toString() . '.' . $ext;
        }

        Storage::disk('public')->put($newPath, $contents);
        $absolute = Storage::disk('public')->path($newPath);

        $asset->path = $newPath;
        $asset->mime_type = $mime;
        $asset->file_size = (int) (@filesize($absolute) ?: strlen($contents));
        $asset->width = $width;
        $asset->height = $height;
        $asset->checksum = hash('sha256', $contents);
        $asset->save();

        $this->writeThumbnailForPath($asset, $contents, $ext);

        $newUrl = (string) $asset->fresh()->url;
        $updated = 0;
        if ($oldUrl !== $newUrl) {
            $updated = $this->usage->rewriteReferences($asset, $oldUrl, $newUrl);
            if ($oldPath !== $newPath && Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }
        }

        $this->audit->log(
            'media.edited.replace',
            'Media',
            (int) $asset->id,
            ['path' => $oldPath, 'url' => $oldUrl],
            ['path' => $newPath, 'url' => $newUrl, 'op' => $op, 'params' => $params, 'updated_references' => $updated],
            [],
            $request,
        );

        return [
            'asset' => $asset->fresh(['collections', 'versions']),
            'updated_references' => $updated,
            'mode' => 'replace',
        ];
    }

    /**
     * Restore the most recent version backup (replace mode undo).
     *
     * @return array{asset: Media, updated_references: int}
     */
    public function restore(Media $asset, ?Request $request = null): array
    {
        $version = MediaAssetVersion::query()
            ->where('media_asset_id', $asset->id)
            ->orderByDesc('id')
            ->first();
        if ($version === null || !Storage::disk('public')->exists($version->path)) {
            abort(422, 'No previous version available to restore.');
        }

        $oldUrl = (string) $asset->url;
        $oldPath = (string) $asset->path;
        $contents = Storage::disk('public')->get($version->path);
        $ext = strtolower((string) pathinfo($version->path, PATHINFO_EXTENSION) ?: 'jpg');

        // Backup current before restoring.
        $this->backupVersion($asset);

        $dir = trim(dirname($oldPath), '.');
        if ($dir === '' || $dir === '/') {
            $dir = 'library/images';
        }
        $newPath = $dir . '/' . Str::uuid()->toString() . '.' . $ext;
        Storage::disk('public')->put($newPath, $contents);

        $asset->path = $newPath;
        $asset->mime_type = $version->mime_type ?: $asset->mime_type;
        $asset->file_size = $version->file_size ?: strlen($contents);
        $asset->width = $version->width;
        $asset->height = $version->height;
        $asset->checksum = hash('sha256', $contents);
        $asset->save();

        $newUrl = (string) $asset->fresh()->url;
        $updated = 0;
        if ($oldUrl !== $newUrl) {
            $updated = $this->usage->rewriteReferences($asset, $oldUrl, $newUrl);
        }
        if ($oldPath !== $newPath && Storage::disk('public')->exists($oldPath)) {
            Storage::disk('public')->delete($oldPath);
        }

        $this->audit->log(
            'media.restored',
            'Media',
            (int) $asset->id,
            ['path' => $oldPath],
            ['path' => $newPath, 'from_version' => $version->id, 'updated_references' => $updated],
            [],
            $request,
        );

        return ['asset' => $asset->fresh(['collections', 'versions']), 'updated_references' => $updated];
    }

    /**
     * Upload a brand-new photo over this catalog row so every place using
     * the same media URL shows the replacement (path kept when possible).
     *
     * @return array{asset: Media, updated_references: int, mode: string}
     */
    public function replaceFile(Media $asset, UploadedFile $file, ?Request $request = null): array
    {
        if ($asset->media_type !== 'image') {
            abort(422, 'Only image assets can be replaced with a new photo.');
        }

        $mime = (string) ($file->getMimeType() ?: '');
        $allowed = MenuImageValidation::allowedMimeTypes();
        if (!in_array($mime, $allowed, true)) {
            if (MenuImageValidation::looksLikeHeic($file)) {
                abort(422, MenuImageValidation::heicRejectedMessage());
            }
            if ($mime === 'image/webp' && !ImageCapabilities::supportsWebp()) {
                abort(422, MenuImageValidation::webpUnsupportedMessage());
            }
            abort(422, 'Unsupported image type.');
        }

        $oldPath = (string) $asset->path;
        $oldMainUrl = (string) $asset->url;
        $oldThumbUrl = is_string($asset->thumb_url) ? $asset->thumb_url : null;
        $oldOriginalUrl = is_string($asset->original_url) ? $asset->original_url : null;
        $oldImageWebp = is_string($asset->image_webp_url) ? $asset->image_webp_url : null;
        $oldThumbWebp = is_string($asset->thumb_webp_url) ? $asset->thumb_webp_url : null;

        $oldMainChecksum = is_string($asset->checksum) && $asset->checksum !== ''
            ? $asset->checksum
            : null;
        if ($oldMainChecksum === null && Storage::disk('public')->exists($oldPath)) {
            $hashed = @hash_file('sha256', Storage::disk('public')->path($oldPath));
            $oldMainChecksum = is_string($hashed) ? $hashed : null;
        }
        $oldThumbChecksum = null;
        if (is_string($oldThumbUrl)) {
            $thumbPath = MediaFileCleaner::storagePathFromUrl($oldThumbUrl);
            if (is_string($thumbPath) && Storage::disk('public')->exists($thumbPath)) {
                $hashed = @hash_file('sha256', Storage::disk('public')->path($thumbPath));
                $oldThumbChecksum = is_string($hashed) ? $hashed : null;
            }
        }

        $this->backupVersion($asset);

        // Drop old derivatives so reconcile cannot resurrect them.
        foreach ([$oldThumbUrl, $oldOriginalUrl, $oldImageWebp, $oldThumbWebp] as $url) {
            $derived = MediaFileCleaner::storagePathFromUrl(is_string($url) ? $url : null);
            if (is_string($derived) && $derived !== '' && $derived !== $oldPath && Storage::disk('public')->exists($derived)) {
                Storage::disk('public')->delete($derived);
            }
        }

        $jpeg = $this->images->processToJpeg($file);
        $thumbJpeg = $this->images->processThumbnailJpeg($file);
        $masterJpeg = $this->images->processMasterJpeg($file);

        $dir = trim(str_replace('\\', '/', (string) dirname($oldPath)), '.');
        if ($dir === '' || $dir === '/') {
            $dir = 'library/images';
        }
        // Always a new basename so CDN/browser caches cannot keep serving the old bytes,
        // and so every stored reference can be rewritten to the new URLs.
        $targetPath = $dir . '/' . Str::uuid()->toString() . '.jpg';

        Storage::disk('public')->put($targetPath, $jpeg);

        $thumbPath = 'library/images/thumbs/' . Str::uuid()->toString() . '.jpg';
        Storage::disk('public')->put($thumbPath, $thumbJpeg);
        $masterPath = 'library/images/masters/' . Str::uuid()->toString() . '.jpg';
        Storage::disk('public')->put($masterPath, $masterJpeg);

        $imageWebp = null;
        $thumbWebp = null;
        try {
            $imageWebp = $this->images->storeWebpFromStoragePath($targetPath, $dir);
        } catch (\Throwable) {
            // Best-effort — primary JPEG is enough for references to update.
        }
        try {
            $thumbWebp = $this->images->storeWebpFromStoragePath($thumbPath, 'library/images/thumbs');
        } catch (\Throwable) {
            // Best-effort
        }

        $absolute = Storage::disk('public')->path($targetPath);
        $size = @getimagesize($absolute) ?: [null, null];

        $asset->path = $targetPath;
        $asset->mime_type = 'image/jpeg';
        $asset->file_size = (int) (@filesize($absolute) ?: strlen($jpeg));
        $asset->width = is_int($size[0] ?? null) ? $size[0] : null;
        $asset->height = is_int($size[1] ?? null) ? $size[1] : null;
        $asset->thumb_url = '/storage/' . ltrim($thumbPath, '/');
        $asset->original_url = '/storage/' . ltrim($masterPath, '/');
        $asset->image_webp_url = $imageWebp ? '/storage/' . ltrim($imageWebp, '/') : null;
        $asset->thumb_webp_url = $thumbWebp ? '/storage/' . ltrim($thumbWebp, '/') : null;
        $asset->checksum = hash('sha256', $jpeg);
        $asset->save();

        $fresh = $asset->fresh();
        $newMainUrl = (string) $fresh->url;
        $newThumbUrl = is_string($fresh->thumb_url) ? $fresh->thumb_url : $newMainUrl;
        $newOriginalUrl = is_string($fresh->original_url) ? $fresh->original_url : $newMainUrl;
        $newImageWebp = is_string($fresh->image_webp_url) ? $fresh->image_webp_url : $newMainUrl;
        $newThumbWebp = is_string($fresh->thumb_webp_url) ? $fresh->thumb_webp_url : $newThumbUrl;

        $map = array_filter([
            $oldMainUrl => $newMainUrl,
            $oldThumbUrl => $newThumbUrl,
            $oldOriginalUrl => $newOriginalUrl,
            $oldImageWebp => $newImageWebp,
            $oldThumbWebp => $newThumbWebp,
        ], static fn ($to, $from) => is_string($from) && $from !== '' && is_string($to) && $to !== '', ARRAY_FILTER_USE_BOTH);

        // Relink byte-identical copies (e.g. menu/ uploads reconciled from the same file).
        if (is_string($oldMainChecksum)) {
            $map = array_merge($map, $this->usage->mapUrlsByFileChecksum($oldMainChecksum, $newMainUrl));
        }
        if (is_string($oldThumbChecksum)) {
            $map = array_merge($map, $this->usage->mapUrlsByFileChecksum($oldThumbChecksum, $newThumbUrl));
        }

        $updated = $this->usage->rewriteUrlMap($map);
        $this->usage->bustDisplayCaches();

        if ($oldPath !== $targetPath && Storage::disk('public')->exists($oldPath)) {
            Storage::disk('public')->delete($oldPath);
        }

        $this->audit->log(
            'media.replaced_file',
            'Media',
            (int) $asset->id,
            ['path' => $oldPath, 'url' => $oldMainUrl],
            ['path' => $targetPath, 'url' => $newMainUrl, 'updated_references' => $updated],
            [],
            $request,
        );

        return [
            'asset' => $asset->fresh(['collections', 'versions']),
            'updated_references' => $updated,
            'mode' => 'replace',
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array{contents: string, ext: string, mime: string, width: int, height: int}
     */
    private function applyOp(Media $asset, string $op, array $params): array
    {
        $sourcePath = $this->resolveSourcePath($asset, $op === 'crop');
        $absolute = Storage::disk('public')->path($sourcePath);
        if (!is_file($absolute)) {
            abort(422, 'Source image file is missing.');
        }

        $image = $this->loadGd($absolute);
        if ($image === false) {
            abort(422, 'Could not load image for editing.');
        }

        return match ($op) {
            'convert' => $this->opConvert($image, $params),
            'resize' => $this->opResize($image, $params),
            'crop' => $this->opCrop($image, $params),
            'rotate' => $this->opRotate($image, $params, $asset),
            'thumbnail' => $this->opThumbnail($asset, $image),
            'optimize' => $this->opOptimize($image, $params),
            default => abort(422, 'Unknown edit operation.'),
        };
    }

    private function resolveSourcePath(Media $asset, bool $preferMaster): string
    {
        if ($preferMaster && $asset->original_url) {
            $master = \App\Support\MediaFileCleaner::storagePathFromUrl($asset->original_url);
            if ($master && Storage::disk('public')->exists($master)) {
                return $master;
            }
        }

        return (string) $asset->path;
    }

    /** @param  \GdImage|resource  $image */
    private function opConvert($image, array $params): array
    {
        $format = strtolower((string) ($params['format'] ?? 'jpeg'));
        if ($format === 'jpg') {
            $format = 'jpeg';
        }
        if (!in_array($format, ['jpeg', 'png', 'webp'], true)) {
            imagedestroy($image);
            abort(422, 'Format must be jpeg, png, or webp.');
        }
        if ($format === 'webp' && !ImageCapabilities::supportsWebp()) {
            imagedestroy($image);
            abort(422, 'WebP is not supported on this server.');
        }

        return $this->encode($image, $format, (int) ($params['quality'] ?? 82));
    }

    /** @param  \GdImage|resource  $image */
    private function opResize($image, array $params): array
    {
        $srcW = imagesx($image);
        $srcH = imagesy($image);
        $keepAspect = (bool) ($params['keep_aspect'] ?? true);
        $preset = (string) ($params['preset'] ?? '');

        [$tw, $th] = match ($preset) {
            '1200x900' => [1200, 900],
            '1400x600' => [1400, 600],
            '512' => [512, 512],
            '256' => [256, 256],
            default => [
                max(1, (int) ($params['width'] ?? $srcW)),
                max(1, (int) ($params['height'] ?? $srcH)),
            ],
        };

        if ($keepAspect && $preset !== '1200x900' && $preset !== '1400x600') {
            $ratio = min($tw / $srcW, $th / $srcH);
            $tw = max(1, (int) round($srcW * $ratio));
            $th = max(1, (int) round($srcH * $ratio));
        }

        $dst = imagecreatetruecolor($tw, $th);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagecopyresampled($dst, $image, 0, 0, 0, 0, $tw, $th, $srcW, $srcH);
        imagedestroy($image);

        $format = strtolower((string) ($params['format'] ?? 'jpeg'));

        return $this->encode($dst, $format === 'png' ? 'png' : ($format === 'webp' ? 'webp' : 'jpeg'), (int) ($params['quality'] ?? 82));
    }

    /** @param  \GdImage|resource  $image */
    private function opCrop($image, array $params): array
    {
        $srcW = imagesx($image);
        $srcH = imagesy($image);
        $x = max(0, (int) ($params['x'] ?? 0));
        $y = max(0, (int) ($params['y'] ?? 0));
        $w = max(1, (int) ($params['width'] ?? $srcW));
        $h = max(1, (int) ($params['height'] ?? $srcH));
        if ($x + $w > $srcW) {
            $w = $srcW - $x;
        }
        if ($y + $h > $srcH) {
            $h = $srcH - $y;
        }
        $outW = max(1, (int) ($params['output_width'] ?? $w));
        $outH = max(1, (int) ($params['output_height'] ?? $h));

        $dst = imagecreatetruecolor($outW, $outH);
        imagecopyresampled($dst, $image, 0, 0, $x, $y, $outW, $outH, $w, $h);
        imagedestroy($image);

        return $this->encode($dst, 'jpeg', 82);
    }

    /**
     * Flip and/or rotate. Both can be applied in one call (flip first, then rotate).
     * Free angles expand the canvas; fill is white for JPEG, transparent for PNG/WebP.
     *
     * @param  \GdImage|resource  $image
     * @param  array<string, mixed>  $params
     */
    private function opRotate($image, array $params, Media $asset): array
    {
        $flip = strtolower(trim((string) ($params['flip'] ?? '')));
        $degrees = (int) ($params['degrees'] ?? 0);
        $degrees = (($degrees % 360) + 360) % 360;

        $didSomething = false;

        if ($flip === 'horizontal') {
            imageflip($image, IMG_FLIP_HORIZONTAL);
            $didSomething = true;
        } elseif ($flip === 'vertical') {
            imageflip($image, IMG_FLIP_VERTICAL);
            $didSomething = true;
        } elseif ($flip === 'both') {
            imageflip($image, IMG_FLIP_BOTH);
            $didSomething = true;
        } elseif ($flip !== '') {
            imagedestroy($image);
            abort(422, 'flip must be horizontal, vertical, or both.');
        }

        $format = $this->outputFormatForAsset($asset, $params);

        if ($degrees !== 0) {
            // imagerotate() is counter-clockwise for positive angles; UI uses clockwise.
            $bg = $this->allocateRotateFill($image, $format);
            $rotated = imagerotate($image, -$degrees, $bg);
            imagedestroy($image);
            if ($rotated === false) {
                abort(422, 'Could not rotate image.');
            }
            $image = $rotated;
            if ($format === 'png' || $format === 'webp') {
                imagealphablending($image, false);
                imagesavealpha($image, true);
            }
            $didSomething = true;
        }

        if (! $didSomething) {
            imagedestroy($image);
            abort(422, 'Provide flip=horizontal|vertical|both and/or degrees (1–359).');
        }

        return $this->encode($image, $format, 82);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function outputFormatForAsset(Media $asset, array $params): string
    {
        $forced = strtolower(trim((string) ($params['format'] ?? '')));
        if ($forced === 'jpg') {
            $forced = 'jpeg';
        }
        if (in_array($forced, ['jpeg', 'png', 'webp'], true)) {
            return $forced;
        }

        $mime = strtolower((string) ($asset->mime_type ?? ''));

        return match (true) {
            str_contains($mime, 'png') => 'png',
            str_contains($mime, 'webp') => 'webp',
            default => 'jpeg',
        };
    }

    /** @param  \GdImage|resource  $image */
    private function allocateRotateFill($image, string $format): int
    {
        if ($format === 'png' || $format === 'webp') {
            imagealphablending($image, false);
            imagesavealpha($image, true);
            $bg = imagecolorallocatealpha($image, 0, 0, 0, 127);
            if ($bg === false) {
                return 0;
            }

            return $bg;
        }

        // JPEG — white corners (not black).
        $bg = imagecolorallocate($image, 255, 255, 255);

        return $bg === false ? 0 : $bg;
    }

    /** @param  \GdImage|resource  $image */
    private function opThumbnail(Media $asset, $image): array
    {
        // Encode current then write thumb; return same primary image binary unchanged.
        $encoded = $this->encode($image, 'jpeg', 82);
        $this->writeThumbnailForPath($asset, $encoded['contents'], 'jpg');

        return $encoded;
    }

    /** @param  \GdImage|resource  $image */
    private function opOptimize($image, array $params): array
    {
        $quality = max(40, min(95, (int) ($params['quality'] ?? 75)));

        return $this->encode($image, 'jpeg', $quality);
    }

    /**
     * @param  \GdImage|resource  $image
     * @return array{contents: string, ext: string, mime: string, width: int, height: int}
     */
    private function encode($image, string $format, int $quality): array
    {
        if ($format === 'webp' && !ImageCapabilities::supportsWebp()) {
            imagedestroy($image);
            abort(422, 'WebP is not supported on this server.');
        }

        ob_start();
        $ok = match ($format) {
            'png' => imagepng($image, null, 6),
            'webp' => imagewebp($image, null, $quality),
            default => imagejpeg($image, null, $quality),
        };
        $contents = (string) ob_get_clean();
        $width = imagesx($image);
        $height = imagesy($image);
        imagedestroy($image);
        if (!$ok || $contents === '') {
            abort(500, 'Failed to encode image.');
        }

        $ext = $format === 'jpeg' ? 'jpg' : $format;
        $mime = match ($format) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        return compact('contents', 'ext', 'mime', 'width', 'height');
    }

    /** @return \GdImage|resource|false */
    private function loadGd(string $absolute)
    {
        $info = @getimagesize($absolute);
        $type = $info[2] ?? null;

        return match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($absolute),
            IMAGETYPE_PNG => @imagecreatefrompng($absolute),
            IMAGETYPE_WEBP => ImageCapabilities::supportsWebp() ? @imagecreatefromwebp($absolute) : false,
            default => false,
        };
    }

    private function backupVersion(Media $asset): void
    {
        if (!Storage::disk('public')->exists($asset->path)) {
            return;
        }
        $ext = pathinfo($asset->path, PATHINFO_EXTENSION) ?: 'jpg';
        $backupPath = 'library/versions/' . $asset->id . '/' . Str::uuid()->toString() . '.' . $ext;
        Storage::disk('public')->copy($asset->path, $backupPath);
        MediaAssetVersion::create([
            'media_asset_id' => $asset->id,
            'path' => $backupPath,
            'mime_type' => $asset->mime_type,
            'file_size' => $asset->file_size,
            'width' => $asset->width,
            'height' => $asset->height,
            'created_at' => now(),
        ]);
    }

    private function writeThumbnailForPath(Media $asset, string $contents, string $ext): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'media_thumb_');
        if ($tmp === false) {
            return;
        }
        file_put_contents($tmp, $contents);
        $uploaded = new \Illuminate\Http\UploadedFile($tmp, 'thumb.' . $ext, $asset->mime_type, null, true);
        try {
            $dir = 'library/images/thumbs';
            $thumb = $this->images->storeThumbnailPair($uploaded, $dir);
            $asset->thumb_url = '/storage/' . ltrim($thumb['path'], '/');
            if ($thumb['webp_path']) {
                $asset->thumb_webp_url = '/storage/' . ltrim($thumb['webp_path'], '/');
            }
            $asset->save();
        } catch (\Throwable) {
            // best-effort
        } finally {
            @unlink($tmp);
        }
    }
}
