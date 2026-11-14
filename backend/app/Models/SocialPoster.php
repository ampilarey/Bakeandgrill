<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A post made in Social Hub → Make a post, kept for later: its words, its
 * photo and which parts show (`spec`), and the design it wears (`layout`,
 * `palette`). The pictures are drawn in the browser, so none is kept here.
 */
class SocialPoster extends Model
{
    protected $fillable = ['name', 'layout', 'palette', 'spec', 'created_by'];

    protected function casts(): array
    {
        return ['spec' => 'array'];
    }
}
