<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SmsContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SmsContactController extends Controller
{
    public function index(): JsonResponse
    {
        $contacts = SmsContact::with('user:id,name,email,phone')
            ->orderBy('name')
            ->get()
            ->map(fn (SmsContact $c) => $this->format($c));

        return response()->json(['contacts' => $contacts]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'required|string|max:20',
            'type' => 'required|in:staff,external',
            'user_id' => 'nullable|exists:users,id',
            'is_enabled' => 'boolean',
            'tags' => 'nullable|array',
            'tags.*' => 'string',
            'active_days' => 'nullable|array',
            'active_days.*' => 'in:mon,tue,wed,thu,fri,sat,sun',
            'active_from' => 'nullable|date_format:H:i',
            'active_until' => 'nullable|date_format:H:i',
            'notes' => 'nullable|string|max:500',
        ]);

        $contact = SmsContact::create($data);
        $contact->load('user:id,name,email,phone');

        return response()->json(['contact' => $this->format($contact)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $contact = SmsContact::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'phone' => 'sometimes|string|max:20',
            'type' => 'sometimes|in:staff,external',
            'user_id' => 'nullable|exists:users,id',
            'is_enabled' => 'sometimes|boolean',
            'tags' => 'nullable|array',
            'tags.*' => 'string',
            'active_days' => 'nullable|array',
            'active_days.*' => 'in:mon,tue,wed,thu,fri,sat,sun',
            'active_from' => 'nullable|date_format:H:i',
            'active_until' => 'nullable|date_format:H:i',
            'notes' => 'nullable|string|max:500',
        ]);

        $contact->update($data);
        $contact->load('user:id,name,email,phone');

        return response()->json(['contact' => $this->format($contact)]);
    }

    public function destroy(int $id): JsonResponse
    {
        SmsContact::findOrFail($id)->delete();

        return response()->json(['message' => 'Contact deleted.']);
    }

    private function format(SmsContact $c): array
    {
        return [
            'id' => $c->id,
            'name' => $c->name,
            'phone' => $c->phone,
            'type' => $c->type,
            'user_id' => $c->user_id,
            'user_name' => $c->user?->name,
            'is_enabled' => $c->is_enabled,
            'tags' => $c->tags ?? [],
            'active_days' => $c->active_days,
            'active_from' => $c->active_from,
            'active_until' => $c->active_until,
            'notes' => $c->notes,
            'created_at' => $c->created_at?->toIso8601String(),
        ];
    }
}
