<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Content\ContentWriter;
use App\Models\ContentSchedule;
use App\Models\SiteSetting;
use Illuminate\Console\Command;

class ContentPublishScheduled extends Command
{
    protected $signature = 'content:publish-scheduled';

    protected $description = 'Apply due Content Studio scheduled publishes';

    public function handle(ContentWriter $writer): int
    {
        $due = ContentSchedule::query()
            ->where('status', ContentSchedule::STATUS_PENDING)
            ->where('publish_at', '<=', now())
            ->orderBy('publish_at')
            ->limit(200)
            ->get();

        $n = 0;
        foreach ($due as $row) {
            $this->ensureRow($row->key, $row->scope, $row->locale);
            $writer->write(
                $row->key,
                $row->scope,
                (string) ($row->value ?? ''),
                $row->locale,
                null,
                'content.scheduled_published',
                ['schedule_id' => $row->id],
            );
            $row->status = ContentSchedule::STATUS_PUBLISHED;
            $row->published_at = now();
            $row->save();
            $n++;
        }

        if ($n > 0) {
            SiteSetting::bust();
        }

        $this->info("Published {$n} scheduled content change(s).");

        return self::SUCCESS;
    }

    private function ensureRow(string $key, string $scope, string $locale): void
    {
        $query = SiteSetting::query()->where('key', $key)->where('scope', $scope);
        if (SiteSetting::hasLocaleColumn()) {
            $query->where('locale', $locale);
        }
        if ($query->exists()) {
            return;
        }
        SiteSetting::set($key, '', $scope, $locale);
    }
}
