<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Label templates (round 7 of the usability work, owner, 2026-10-13: "Start
 * from a saved label or a built-in template, and Save as template from any
 * label, so a new sauce takes thirty seconds"). A template is a label's
 * settings without the product itself (App\Domains\Labels\LabelTemplates::KEYS,
 * kept as JSON) and the size it printed at; `source` names the label it was
 * saved from. The built-in templates are code, not rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('label_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60);
            $table->string('source', 80)->nullable();
            $table->json('fields');
            $table->json('size')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('label_templates');
    }
};
