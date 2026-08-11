<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\Blocks\GenericBlockPresenter;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class GenericBlockPresenterTest extends TestCase
{
    /** @return array<string, array{0: string, 1: array<string, mixed>, 2: bool}> */
    public static function emptinessProvider(): array
    {
        return [
            'blank rich text' => ['rich_text', [], true],
            'rich text with only markup' => ['rich_text', ['body' => '<p>  </p>'], true],
            'rich text with heading' => ['rich_text', ['heading' => 'Hello'], false],
            'rich text with body' => ['rich_text', ['body' => '<p>Hi</p>'], false],
            'image without media' => ['image', ['caption' => 'A caption alone'], true],
            'image with media' => ['image', ['media_id' => 4], false],
            'image with blank media id' => ['image', ['media_id' => ''], true],
            'video without media' => ['video', [], true],
            'image_text with words only' => ['image_text', ['heading' => 'Since 2014'], false],
            'image_text with nothing' => ['image_text', ['side' => 'left'], true],
            'button band with a label' => ['button_band', ['button2_label' => 'Menu'], false],
            'button band with links only' => ['button_band', ['button1_url' => '/order/'], true],
            'divider is never empty' => ['divider', [], false],
            'faq with no items' => ['faq_list', ['items' => []], true],
            'faq with a blank row' => ['faq_list', ['items' => [['question' => '', 'answer' => '']]], true],
            'faq with a question' => ['faq_list', ['items' => [['question' => 'Open?', 'answer' => 'Yes']]], false],
        ];
    }

    /** @param array<string, mixed> $settings */
    #[DataProvider('emptinessProvider')]
    public function test_is_empty(string $type, array $settings, bool $expected): void
    {
        $this->assertSame($expected, GenericBlockPresenter::isEmpty($type, $settings));
    }

    public function test_rich_body_keeps_allowed_markup_but_loses_scripts(): void
    {
        $clean = GenericBlockPresenter::sanitizeSettings('rich_text', [
            'heading' => 'Bread <em>and</em> butter',
            'body' => '<p>Fresh</p><script>alert(1)</script><div onclick="x()">nope</div>',
        ]);

        $this->assertSame('Bread and butter', $clean['heading'], 'Headings are plain text.');
        $this->assertStringContainsString('<p>Fresh</p>', $clean['body']);
        $this->assertStringNotContainsString('<script', $clean['body']);
        $this->assertStringNotContainsString('onclick', $clean['body']);
    }

    public function test_faq_rows_are_normalised_and_sanitised(): void
    {
        $clean = GenericBlockPresenter::sanitizeSettings('faq_list', [
            'items' => [
                ['question' => 'Do you <b>deliver</b>?', 'answer' => '<p>Yes</p><script>alert(1)</script>', 'extra' => 'x'],
                'not-an-array',
            ],
        ]);

        $this->assertSame('Do you deliver?', $clean['items'][0]['question']);
        $this->assertStringNotContainsString('<script', $clean['items'][0]['answer']);
        $this->assertArrayNotHasKey('extra', $clean['items'][0]);
        $this->assertSame(['question' => '', 'answer' => ''], $clean['items'][1]);
    }

    public function test_button_links_are_restricted_to_safe_schemes(): void
    {
        $clean = GenericBlockPresenter::sanitizeSettings('button_band', [
            'button1_url' => 'javascript:alert(1)',
            'button2_url' => 'https://bakeandgrill.mv/menu',
            'button1_label' => '<b>Order</b>',
        ]);

        $this->assertSame('', $clean['button1_url']);
        $this->assertSame('https://bakeandgrill.mv/menu', $clean['button2_url']);
        $this->assertSame('Order', $clean['button1_label']);
    }

    public function test_non_generic_types_are_left_alone(): void
    {
        $settings = ['hero_slides' => [['title' => '<b>Keep me</b>']]];

        $this->assertSame($settings, GenericBlockPresenter::sanitizeSettings('hero', $settings));
    }

    public function test_media_id_reading_is_forgiving(): void
    {
        $this->assertSame(7, GenericBlockPresenter::mediaId(['media_id' => '7']));
        $this->assertNull(GenericBlockPresenter::mediaId(['media_id' => 'abc']));
        $this->assertNull(GenericBlockPresenter::mediaId(['media_id' => 0]));
        $this->assertNull(GenericBlockPresenter::mediaId([]));
    }
}
