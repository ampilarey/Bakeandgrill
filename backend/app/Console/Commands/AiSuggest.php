<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Ai\AiFeatures;
use App\Domains\Ai\AiSuggestions;
use App\Domains\Ai\AssistantUnavailable;
use App\Domains\Ai\ReviewPhotoNotes;
use Illuminate\Console\Command;
use Throwable;

/**
 * The assistant's nightly look (owner, 2026-11-24: "can add automatic dhivehi and rest of
 * the possible automatic updates?"): for each kind whose switch is on it asks the assistant
 * and keeps what it proposes on System → Integrations → Suggestions. It changes nothing
 * else: every proposal waits for a person. With no key, or the switches off, it does
 * nothing and costs nothing; one kind that fails is logged and the rest still run.
 */
class AiSuggest extends Command
{
    protected $signature = 'ai:suggest {--kind= : One kind only}';

    protected $description = 'Ask the assistant for suggestions that wait for approval';

    public function handle(AiSuggestions $suggestions, AiFeatures $features): int
    {
        $only = $this->option('kind');
        foreach (AiSuggestions::KINDS as $kind => $def) {
            // A kind made by another kind's look (the three a dish photo gives) is not looked for twice.
            if (($only && $only !== $kind) || isset($def['look']) || !$features->on($def['feature'])) {
                continue;
            }
            try {
                $this->line(sprintf('%s: %d new', $kind, $suggestions->look($kind)));
            } catch (AssistantUnavailable $e) {
                $this->warn("{$kind}: " . $e->getMessage());
            } catch (Throwable $e) {
                report($e);
                $this->warn("{$kind}: failed");
            }
        }

        if (!$only && $features->on('review_photos')) {
            try {
                $this->line('review photos: ' . app(ReviewPhotoNotes::class)->look() . ' noted');
            } catch (AssistantUnavailable $e) {
                $this->warn('review photos: ' . $e->getMessage());
            } catch (Throwable $e) {
                report($e);
            }
        }

        return self::SUCCESS;
    }
}
