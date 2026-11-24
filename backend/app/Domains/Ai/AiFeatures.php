<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use App\Models\SiteSetting;

/**
 * Which assistant features are switched on (owner, 2026-11-24: "add admin settings to
 * on/off"): one master switch and one per feature, on System → Integrations → Assistant.
 * A feature works when the master is on, its own switch is on and the picked service has
 * a key. Everything is on until switched off, so a typed key is all it takes; nothing here
 * runs by itself, each use is a button a person pressed (or a question they sent the bot).
 * A new assistant feature is a row in FEATURES and asks on() before it calls Assistant.
 */
class AiFeatures
{
    /** @var array<string, array{label: string, about: string, where: string}> */
    public const FEATURES = [
        'po_scans' => ['label' => 'Read scanned purchase orders', 'about' => 'A scanned or photographed customer PO is read into the invoice form.', 'where' => 'Finance → Invoices → From a PO'],
        'reply_drafts' => ['label' => 'Draft replies to customers', 'about' => 'A Draft reply button on reviews, complaints, dish questions and social comments. Nothing is sent until you send it.', 'where' => 'Reviews, Complaints, Dish questions, Social Hub → Comments'],
        'glossary' => ['label' => 'Dhivehi for label ingredients', 'about' => 'Suggests Dhivehi for ingredient words the glossary is missing, for you to approve.', 'where' => 'Labels → Setup → Ingredient glossary'],
        'dhivehi' => ['label' => 'Dhivehi drafts', 'about' => 'A Draft Dhivehi button beside Dhivehi boxes fills them from the English. Have a Dhivehi speaker check it.', 'where' => 'Under every Dhivehi box: menu, labels, cards, signage, social, newsletter, messages'],
        'nutrition' => ['label' => 'Nutrition values for ingredients', 'about' => 'Suggests typical values per 100 g for ingredients that have none. You check and save.', 'where' => 'Labels → Setup → Nutrition'],
        'captions' => ['label' => 'Social post captions', 'about' => 'Writes the caption for a post in English and Dhivehi.', 'where' => 'Social Hub → Make a post'],
        'newsletter' => ['label' => 'Newsletter first draft', 'about' => 'Drafts the subject and opening words of an issue from what you ticked.', 'where' => 'Customers & Marketing → Newsletter'],
        // Suggestions made by themselves each night, kept on Integrations → Suggestions until someone approves them.
        'auto_menu' => ['label' => 'Menu suggestions', 'about' => 'Each night: Dhivehi for dishes that have none, dishes that look to be in the wrong section, and a clearer order within a section. Nothing changes on the menu until someone approves it.', 'where' => 'System → Integrations → Suggestions'],
        'auto_inventory' => ['label' => 'Inventory suggestions', 'about' => 'Each night: a category for items that have none, and items that look to be entered twice. Approved before anything changes.', 'where' => 'System → Integrations → Suggestions'],
        'auto_labels' => ['label' => 'Label suggestions', 'about' => 'Each night: Dhivehi for ingredient words the glossary lacks and nutrition values for ingredients with none. Approved before anything prints.', 'where' => 'System → Integrations → Suggestions'],
        'auto_photos' => ['label' => 'Photo suggestions', 'about' => 'Each night it looks at dish photos it has not seen: a better crop round the dish, photos that are blurry, dark or cut off, photos plain enough to cut out, and a description and tags for library pictures. Approved before anything changes.', 'where' => 'System → Integrations → Suggestions'],
        'photo_generate' => ['label' => 'Make photos for dishes with none', 'about' => 'Makes a picture for the best-selling dishes that have no photo, for you to approve. Needs a Google key. A made picture is not a photo of your own food: use it only where it looks like what you serve.', 'where' => 'System → Integrations → Suggestions'],
        'review_photos' => ['label' => 'Notes on review photos', 'about' => 'Each night a line saying what a waiting review\'s photo shows, and whether to check it before showing.', 'where' => 'Customers → Reviews'],
        'telegram_ask' => ['label' => 'Questions on the Telegram bot', 'about' => 'Owners and managers can ask the bot about sales and items in plain words.', 'where' => 'Telegram → More → Ask a question, or /ask'],
    ];

    public function __construct(private readonly Assistant $assistant) {}

    public function master(): bool
    {
        return self::flag('ai_enabled');
    }

    public function switchedOn(string $feature): bool
    {
        return isset(self::FEATURES[$feature]) && self::flag("ai_feature_{$feature}");
    }

    /** The one question a feature asks before it calls the assistant. */
    public function on(string $feature): bool
    {
        return $this->master() && $this->switchedOn($feature) && $this->assistant->ready();
    }

    /** @throws AssistantUnavailable with the reason, for a screen */
    public function mustBeOn(string $feature): void
    {
        if (!$this->assistant->ready()) {
            throw new AssistantUnavailable('The assistant is not set up yet: add a key under Purchasing → Settings → Reading bills.');
        }
        if (!$this->master() || !$this->switchedOn($feature)) {
            throw new AssistantUnavailable('This assistant feature is switched off (System → Integrations → Assistant).');
        }
    }

    /** @param array<string, bool> $features */
    public function save(?bool $master, array $features): void
    {
        if ($master !== null) {
            SiteSetting::set('ai_enabled', $master ? '1' : '0');
        }
        foreach ($features as $key => $on) {
            if (isset(self::FEATURES[$key])) {
                SiteSetting::set("ai_feature_{$key}", $on ? '1' : '0');
            }
        }
    }

    /**
     * What any staff screen needs: which buttons to show.
     *
     * @return array{ready: bool, enabled: bool, features: array<string, bool>}
     */
    public function status(): array
    {
        $out = [];
        foreach (array_keys(self::FEATURES) as $key) {
            $out[$key] = $this->on($key);
        }

        return ['ready' => $this->assistant->ready(), 'enabled' => $this->master(), 'features' => $out];
    }

    /**
     * For the settings card: every switch as it is set, whatever the key's state.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        $rows = [];
        foreach (self::FEATURES as $key => $f) {
            $rows[] = ['key' => $key] + $f + ['on' => $this->switchedOn($key)];
        }

        $maker = app(ImageMaker::class);

        return [
            'ready' => $this->assistant->ready(), 'enabled' => $this->master(), 'features' => $rows,
            // Making pictures is Google's job, whichever service does the rest.
            'images' => ['ready' => $maker->ready(), 'model' => $maker->model(), 'default_model' => ImageMaker::DEFAULT_MODEL],
        ];
    }

    private static function flag(string $key): bool
    {
        $v = SiteSetting::get($key, '1');

        return !in_array($v, ['0', 0, false, 'false', 'off'], true);
    }
}
