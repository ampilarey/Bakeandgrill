<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Http\Controllers\Controller;
use App\Models\SmsTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsTemplateController extends Controller
{
    public function __construct(
        private readonly SmsTemplateRenderer $renderer,
    ) {}

    public function index(): JsonResponse
    {
        $templates = SmsTemplate::orderByDesc('is_system')->orderBy('name')->get()
            ->map(fn (SmsTemplate $t) => $this->format($t));

        return response()->json(['templates' => $templates]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'body' => 'required|string',
            'type' => 'required|in:order_notification,schedule_reminder,duty_reminder,custom',
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
            'type' => 'sometimes|in:order_notification,schedule_reminder,duty_reminder,custom',
            'description' => 'nullable|string|max:500',
        ]);

        $template->update($data);

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
