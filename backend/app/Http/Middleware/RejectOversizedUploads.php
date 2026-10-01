<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

/**
 * Say so when PHP dropped an upload for being too big (media audit,
 * 2026-10-01).
 *
 * A single file over upload_max_filesize arrives as an error code the file
 * rule reports as "failed to upload". A whole request over post_max_size is
 * caught by the framework (PostTooLargeException) and worded in
 * bootstrap/app.php. Both now say what the limit is.
 */
class RejectOversizedUploads
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!in_array($request->method(), ['POST', 'PUT', 'PATCH'], true)) {
            return $next($request);
        }

        foreach ($request->allFiles() as $file) {
            foreach (is_array($file) ? $file : [$file] as $one) {
                if ($one instanceof UploadedFile && in_array($one->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                    return self::tooLarge(self::bytes((string) ini_get('upload_max_filesize')));
                }
            }
        }

        return $next($request);
    }

    public static function tooLarge(int $limitBytes): Response
    {
        $message = self::message($limitBytes);

        return response()->json(['message' => $message, 'errors' => ['file' => [$message]]], 413);
    }

    public static function message(int $limitBytes): string
    {
        $mb = $limitBytes > 0 ? round($limitBytes / 1048576) : null;

        return $mb !== null
            ? "That upload is bigger than this server allows ({$mb} MB). Use a smaller file."
            : 'That upload is bigger than this server allows. Use a smaller file.';
    }

    /** "64M", "2G", "512K" or a plain number of bytes. */
    public static function bytes(string $ini): int
    {
        $ini = trim($ini);
        if ($ini === '' || $ini === '-1') {
            return 0;
        }
        $unit = strtolower(substr($ini, -1));
        $n = (int) $ini;

        return match ($unit) {
            'g' => $n * 1073741824,
            'm' => $n * 1048576,
            'k' => $n * 1024,
            default => $n,
        };
    }
}
