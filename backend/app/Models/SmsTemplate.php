<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SmsTemplate extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'body',
        'type',
        'description',
        'is_system',
        'variables',
    ];

    protected function casts(): array
    {
        return [
            'is_system' => 'boolean',
            'variables' => 'array',
        ];
    }

    public function scheduledMessages(): HasMany
    {
        return $this->hasMany(SmsScheduledMessage::class, 'template_id');
    }

    /**
     * Extract variable names from the template body ({{variable}} syntax).
     */
    public function extractVariables(): array
    {
        preg_match_all('/\{\{(\w+)\}\}/', $this->body, $matches);

        return array_unique($matches[1] ?? []);
    }
}
