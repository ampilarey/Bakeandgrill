<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SmsTemplateRendererTest extends TestCase
{
    use RefreshDatabase;

    private SmsTemplateRenderer $renderer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->renderer = new SmsTemplateRenderer();
    }

    private function makeTemplate(string $body): SmsTemplate
    {
        $template = new SmsTemplate(['body' => $body, 'name' => 'Test', 'slug' => 'test-' . uniqid(), 'type' => 'custom']);
        $template->id = 1;

        return $template;
    }

    public function test_renders_single_variable(): void
    {
        $t = $this->makeTemplate('Hello {{name}}!');
        $result = $this->renderer->render($t, ['name' => 'Ahmed']);

        $this->assertSame('Hello Ahmed!', $result);
    }

    public function test_renders_multiple_variables(): void
    {
        $t = $this->makeTemplate('Order #{{order_number}} ({{order_type}}) is ready.');
        $result = $this->renderer->render($t, ['order_number' => '1024', 'order_type' => 'takeaway']);

        $this->assertSame('Order #1024 (takeaway) is ready.', $result);
    }

    public function test_unknown_variables_are_left_intact(): void
    {
        $t = $this->makeTemplate('Hello {{name}}, your {{unknown}} is ready.');
        $result = $this->renderer->render($t, ['name' => 'Ahmed']);

        $this->assertStringContainsString('{{unknown}}', $result);
        $this->assertStringNotContainsString('{{name}}', $result);
    }

    public function test_renders_raw_body(): void
    {
        $result = $this->renderer->renderRaw('Shift: {{start}} - {{end}}', ['start' => '09:00', 'end' => '17:00']);

        $this->assertSame('Shift: 09:00 - 17:00', $result);
    }

    public function test_preview_replaces_with_labels(): void
    {
        $t = $this->makeTemplate('Order #{{order_number}} is {{status}}.');
        $preview = $this->renderer->preview($t);

        $this->assertStringContainsString('[ORDER_NUMBER]', $preview);
        $this->assertStringContainsString('[STATUS]', $preview);
    }

    public function test_empty_variables_array_leaves_placeholders(): void
    {
        $t = $this->makeTemplate('Hi {{name}}');
        $result = $this->renderer->render($t, []);

        $this->assertSame('Hi {{name}}', $result);
    }
}
