<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Http\Controllers\Controller;
use App\Models\SmsTemplate;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsTemplateController extends Controller
{
    public function __construct(
        private readonly SmsTemplateRenderer $renderer,
        private readonly AuditLogService $audit,
    ) {}

    public function index(): JsonResponse
    {
        $usedBy = self::rowsBySlug();
        $templates = SmsTemplate::orderByDesc('is_system')->orderBy('name')->get()
            ->map(fn (SmsTemplate $t) => $this->format($t) + ['used_by' => $usedBy[$t->slug] ?? []]);

        return response()->json(['templates' => $templates]);
    }

    /**
     * The messages in Admin → Notifications whose wording each template is
     * (notifications audit, 2026-10-10). That wording is edited on the
     * message's own row; SMS campaigns → Templates keeps the rest.
     *
     * @return array<string, list<array{key: string, label: string}>>
     */
    private static function rowsBySlug(): array
    {
        $map = [];
        foreach (SmsTypeRegistry::all() as $entry) {
            $slug = $entry['template_slug'] ?? null;
            if (!$slug || in_array($entry['key'], SmsTypeRegistry::HIDDEN_FROM_LIST, true)) {
                continue;
            }
            $map[$slug][] = ['key' => (string) $entry['key'], 'label' => (string) $entry['label']];
        }
        foreach (SmsTypeRegistry::EXTRA_TEMPLATES as $key => $extra) {
            $entry = SmsTypeRegistry::get($key);
            foreach (array_keys($extra) as $slug) {
                $map[$slug][] = ['key' => $key, 'label' => (string) ($entry['label'] ?? $key)];
            }
        }

        return $map;
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'body' => 'required|string',
            'type' => 'required|in:order_notification,schedule_reminder,duty_reminder,custom,customer_notification',
            'description' => 'nullable|string|max:500',
        ]);

        $data['is_system'] = false;
        $data['slug'] = \Illuminate\Support\Str::slug($data['name']) . '-' . \Illuminate\Support\Str::random(4);

        $template = SmsTemplate::create($data);

        return response()->json(['template' => $this->format($template)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $template = SmsTemplate::findOrFail($id);

        // System templates can have their body edited but not deleted
        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'body' => 'sometimes|string',
            'type' => 'sometimes|in:order_notification,schedule_reminder,duty_reminder,custom,customer_notification',
            'description' => 'nullable|string|max:500',
        ]);

        $old = ['body' => $template->body, 'name' => $template->name];
        $template->update($data);

        $this->audit->log(
            'sms.template.updated',
            'SmsTemplate',
            $template->id,
            $old,
            ['body' => $template->body, 'name' => $template->name, 'slug' => $template->slug],
            [],
            $request,
        );

        return response()->json(['template' => $this->format($template)]);
    }

    public function destroy(int $id): JsonResponse
    {
        $template = SmsTemplate::findOrFail($id);

        if ($template->is_system) {
            return response()->json(['message' => 'System templates cannot be deleted.'], 422);
        }

        $template->delete();

        return response()->json(['message' => 'Template deleted.']);
    }

    /** POST /admin/sms/templates/{id}/preview */
    public function preview(int $id): JsonResponse
    {
        $template = SmsTemplate::findOrFail($id);

        return response()->json([
            'preview' => $this->renderer->preview($template),
            'variables' => $template->extractVariables(),
        ]);
    }

    private function format(SmsTemplate $t): array
    {
        return [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'body' => $t->body,
            'type' => $t->type,
            'description' => $t->description,
            'is_system' => $t->is_system,
            'variables' => $t->variables ?? [],
            'created_at' => $t->created_at?->toIso8601String(),
        ];
    }
}
