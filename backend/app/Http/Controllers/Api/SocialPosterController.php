<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Labels\LabelSettings;
use App\Domains\Media\Services\VideoProcessor;
use App\Domains\Permissions\Services\PermissionService;
use App\Http\Controllers\Controller;
use App\Models\SocialPoster;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Social Hub → Make a post (owner, 2026-11-14: "a separate poster maker for
 * social media… one click and change the design and layout but information
 * remains same… saved for later"). The pictures are drawn in the browser
 * from one set of words and one photo; this keeps the saved posts, hands
 * over the business's own details, and takes a finished picture so the
 * composer can post it. Reading needs social.view (the route); every write
 * checks social.compose here, as the composer does.
 */
class SocialPosterController extends Controller
{
    /** The words a post may carry, and the longest each may be. */
    private const TEXT = ['headline' => 80, 'kicker' => 40, 'tagline' => 120, 'price' => 12, 'was' => 12, 'badge' => 40, 'cta' => 30, 'cta2' => 30, 'phone' => 30, 'website' => 80, 'motion' => 40, 'link' => 500, 'photo' => 500, 'brand' => 60, 'caption' => 1500];

    /** The parts that can be shown or hidden. */
    private const PARTS = ['kicker', 'tagline', 'price', 'was', 'badge', 'cta', 'cta2', 'phone', 'website', 'logo', 'qr'];

    /** How the main button is drawn; anything else is the design's own way. */
    private const BUTTON_STYLES = ['auto', 'solid', 'outline', 'pop'];

    public function index(): JsonResponse
    {
        $contact = LabelSettings::contact();

        return response()->json([
            'data' => SocialPoster::query()->latest('updated_at')->limit(200)->get()->map(fn (SocialPoster $p) => $this->present($p))->values(),
            'brand' => [
                'name' => $contact['name'],
                'tagline' => $contact['tagline'],
                'phone' => $contact['phone'],
                'website' => $contact['website'],
                'order_url' => rtrim((string) config('app.url'), '/') . '/order',
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        $data = $this->checked($request);
        $poster = SocialPoster::query()->create($data + ['created_by' => $request->user()?->id]);

        return response()->json(['data' => $this->present($poster)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        $poster = SocialPoster::query()->findOrFail($id);
        $poster->update($this->checked($request));

        return response()->json(['data' => $this->present($poster)]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        SocialPoster::query()->findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * A finished picture, drawn in the browser, kept where a channel can
     * fetch it. Redrawn here as a JPEG (Instagram takes nothing else, and a
     * redraw leaves nothing in the file but its pixels).
     */
    public function picture(Request $request): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        $request->validate(['picture' => ['required', 'file', 'max:8192', 'mimes:png,jpg,jpeg']]);
        $raw = (string) file_get_contents($request->file('picture')->getRealPath());
        $img = @imagecreatefromstring($raw);
        if ($img === false) {
            return response()->json(['message' => 'That picture could not be read.'], 422);
        }
        $w = imagesx($img);
        $h = imagesy($img);
        if ($w < 300 || $h < 300 || $w > 4096 || $h > 4096) {
            imagedestroy($img);

            return response()->json(['message' => 'That picture is the wrong size.'], 422);
        }
        // On white: a JPEG has no see-through.
        $flat = imagecreatetruecolor($w, $h);
        imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
        imagecopy($flat, $img, 0, 0, 0, 0, $w, $h);
        ob_start();
        imagejpeg($flat, null, 90);
        $jpeg = (string) ob_get_clean();
        imagedestroy($img);
        imagedestroy($flat);

        $path = 'social-posters/' . now()->format('Y/m') . '/' . Str::lower(Str::random(24)) . '.jpg';
        Storage::disk('public')->put($path, $jpeg);

        return response()->json(['url' => url(Storage::disk('public')->url($path)), 'width' => $w, 'height' => $h]);
    }

    /**
     * An animated post, filmed by the browser as it played (MP4 from Safari,
     * WebM from most others), made into an MP4 every platform takes: H.264,
     * no sound, even sides, ready to stream. Without ffmpeg an MP4 is kept as
     * it came and a WebM is refused, since Instagram and WhatsApp take no WebM.
     */
    public function video(Request $request, VideoProcessor $ffmpeg): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        $request->validate(['video' => ['required', 'file', 'max:61440', 'mimetypes:video/mp4,video/webm,video/quicktime,video/x-matroska']]);
        $file = $request->file('video');
        $isMp4 = in_array($file->getMimeType(), ['video/mp4', 'video/quicktime'], true);
        $path = 'social-posters/video/' . now()->format('Y/m') . '/' . Str::lower(Str::random(24)) . '.mp4';
        $disk = Storage::disk('public');

        $converted = false;
        if ($ffmpeg->available()) {
            $tmp = (string) tempnam(sys_get_temp_dir(), 'spv');
            $out = $tmp . '.mp4';
            $run = Process::timeout(110)->run([
                $ffmpeg->ffmpegBinary(), '-y', '-i', $file->getRealPath(),
                '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                '-r', '30', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', $out,
            ]);
            if ($run->successful() && is_file($out) && filesize($out) > 0) {
                $disk->put($path, (string) file_get_contents($out));
                $converted = true;
            }
            @unlink($out);
            @unlink($tmp);
        }
        if (!$converted) {
            if (!$isMp4) {
                return response()->json(['message' => 'The video could not be made into an MP4 on this server. Try from Safari on an iPhone or a Mac, which records MP4 itself.'], 422);
            }
            $disk->put($path, (string) file_get_contents($file->getRealPath()));
        }

        return response()->json(['url' => url($disk->url($path)), 'converted' => $converted]);
    }

    /** @return array{name: string, layout: string, palette: string, spec: array<string, mixed>} */
    private function checked(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'layout' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'palette' => ['required', 'string', 'max:40', 'regex:/^[a-z0-9-]+$/'],
            'spec' => ['required', 'array'],
        ]);
        $in = $data['spec'];
        $spec = [];
        foreach (self::TEXT as $key => $max) {
            $spec[$key] = mb_substr(trim((string) (is_scalar($in[$key] ?? null) ? $in[$key] : '')), 0, $max);
        }
        $spec['ctaStyle'] = in_array($in['ctaStyle'] ?? null, self::BUTTON_STYLES, true) ? $in['ctaStyle'] : 'auto';
        $spec['cutout'] = filter_var($in['cutout'] ?? false, FILTER_VALIDATE_BOOL);
        $spec['itemId'] = is_numeric($in['itemId'] ?? null) && (int) $in['itemId'] > 0 ? (int) $in['itemId'] : null;
        $spec['show'] = [];
        foreach (self::PARTS as $part) {
            $spec['show'][$part] = filter_var($in['show'][$part] ?? false, FILTER_VALIDATE_BOOL);
        }

        return ['name' => trim($data['name']), 'layout' => $data['layout'], 'palette' => $data['palette'], 'spec' => $spec];
    }

    /** @return array<string, mixed> */
    private function present(SocialPoster $p): array
    {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'layout' => $p->layout,
            'palette' => $p->palette,
            'spec' => $p->spec,
            'updated_at' => $p->updated_at?->toIso8601String(),
        ];
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof User || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }
}
