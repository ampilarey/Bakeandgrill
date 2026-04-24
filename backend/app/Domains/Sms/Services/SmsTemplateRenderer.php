<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Models\SmsTemplate;

class SmsTemplateRenderer
{
    /**
     * Render a template by replacing {{variable}} placeholders with values.
     * Unknown variables are left as-is so no data is silently dropped.
     */
    public function render(SmsTemplate $template, array $variables = []): string
    {
        $body = $template->body;

        foreach ($variables as $key => $value) {
            $body = str_replace('{{' . $key . '}}', (string) $value, $body);
        }

        return trim($body);
    }

    /**
     * Render a raw body string (without a template model) using the same syntax.
     */
    public function renderRaw(string $body, array $variables = []): string
    {
        foreach ($variables as $key => $value) {
            $body = str_replace('{{' . $key . '}}', (string) $value, $body);
        }

        return trim($body);
    }

    /**
     * Preview a template by replacing variables with placeholder labels.
     */
    public function preview(SmsTemplate $template): string
    {
        $vars = $template->extractVariables();
        $placeholders = array_combine(
            $vars,
            array_map(fn ($v) => '[' . strtoupper($v) . ']', $vars),
        );

        return $this->render($template, $placeholders ?: []);
    }
}
