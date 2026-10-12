<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Labels, 2026-10-12 (owner: "All" of the advanced features): an ingredient
 * glossary, English → Dhivehi, so a recipe or a typed list prints its
 * Dhivehi line without a Dhivehi name on every inventory item. Seeded with
 * the kitchen's everyday ingredients; the owner edits it on Labels → Settings.
 */
return new class extends Migration
{
    /** @var array<string, string> */
    private const SEED = [
        'flour' => 'ފުށް', 'wheat flour' => 'ފުށް', 'all-purpose flour' => 'ފުށް', 'plain flour' => 'ފުށް',
        'salt' => 'ލޮނު', 'sugar' => 'ހަކުރު', 'icing sugar' => 'އައިސިންގ ހަކުރު', 'oil' => 'ތެޔޮ', 'vegetable oil' => 'ތެޔޮ',
        'coconut oil' => 'ކާށި ތެޔޮ', 'water' => 'ފެން', 'egg' => 'ބިސް', 'eggs' => 'ބިސް', 'onion' => 'ފިޔާ', 'onions' => 'ފިޔާ',
        'garlic' => 'ލޮނުމެދު', 'ginger' => 'އިނގުރު', 'chilli' => 'މިރުސް', 'chili' => 'މިރުސް', 'chillies' => 'މިރުސް',
        'green chilli' => 'ތޮޅި މިރުސް', 'curry leaves' => 'ހިކަނދިފަތް', 'pandan leaves' => 'ރާނބާފަތް', 'rampe' => 'ރާނބާފަތް',
        'lemon' => 'ލުނބޯ', 'lime' => 'ލުނބޯ', 'tuna' => 'ކަނޑުމަސް', 'smoked tuna' => 'ވަޅޯމަސް', 'fish' => 'މަސް',
        'coconut' => 'ކާށި', 'grated coconut' => 'ހުނި', 'coconut milk' => 'ކާށި ކިރު', 'rice' => 'ހަނޑޫ', 'milk' => 'ކިރު',
        'condensed milk' => 'ގެރިކިރު', 'milk powder' => 'ކިރު ޕައުޑަރު', 'butter' => 'ބަޓަރު', 'margarine' => 'މާޖިރީން',
        'cheese' => 'ޗީޒް', 'cream' => 'ކްރީމް', 'yoghurt' => 'ޔޯގަޓް', 'potato' => 'އަލުވި', 'potatoes' => 'އަލުވި',
        'chicken' => 'ކުކުޅު', 'beef' => 'ގެރިމަސް', 'prawns' => 'ޑިނގާ', 'prawn' => 'ޑިނގާ', 'black pepper' => 'އަސޭމިރުސް',
        'pepper' => 'އަސޭމިރުސް', 'turmeric' => 'ރީނދޫ', 'cumin' => 'ދިރި', 'coriander' => 'ކޮތަނބިރި', 'cardamom' => 'ކާފޫރުތޮޅި',
        'cinnamon' => 'ފޮނިތޮށި', 'cloves' => 'ކަރަންފޫ', 'tomato' => 'ޓޮމާޓޯ', 'tomatoes' => 'ޓޮމާޓޯ', 'carrot' => 'ކެރެޓް',
        'cabbage' => 'ކެބެޖް', 'cucumber' => 'ކިއުކަމްބަރ', 'lettuce' => 'ލެޓިއުސް', 'capsicum' => 'ކެޕްސިކަމް', 'mint' => 'ކުދީނާ',
        'banana' => 'ދޮންކެޔޮ', 'breadfruit' => 'ބަނބުކެޔޮ', 'pumpkin' => 'ބަރަބޯ', 'screwpine' => 'ކަށިކެޔޮ', 'papaya' => 'ފަޅޯ',
        'mango' => 'އަނބު', 'dates' => 'ކަދުރު', 'yeast' => 'އީސްޓް', 'baking powder' => 'ބޭކިންގ ޕައުޑަރ', 'vanilla' => 'ވެނިލާ',
        'cocoa' => 'ކޮކޯ', 'chocolate' => 'ޗޮކްލެޓް', 'honey' => 'މާމުއި', 'vinegar' => 'ވިނިގަރ', 'soy sauce' => 'ސޯޔާ ސޯސް',
        'corn flour' => 'ކޯން ފްލާ', 'cornflour' => 'ކޯން ފްލާ', 'bread' => 'ޕާން', 'noodles' => 'ނޫޑްލްސް', 'pasta' => 'ޕާސްތާ',
        'jam' => 'ޖޭމް', 'tea' => 'ސައި', 'coffee' => 'ކޮފީ',
    ];

    public function up(): void
    {
        Schema::create('label_glossary', function (Blueprint $table): void {
            $table->id();
            // The English as typed, and its lower-case form that the match goes by.
            $table->string('en', 80);
            $table->string('word', 80)->unique();
            $table->string('dv', 160);
            $table->timestamps();
        });

        $now = now();
        $rows = [];
        foreach (self::SEED as $en => $dv) {
            $rows[] = ['en' => $en, 'word' => mb_strtolower($en), 'dv' => $dv, 'created_at' => $now, 'updated_at' => $now];
        }
        DB::table('label_glossary')->insert($rows);
    }

    public function down(): void
    {
        Schema::dropIfExists('label_glossary');
    }
};
