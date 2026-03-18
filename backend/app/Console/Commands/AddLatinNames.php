<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AddLatinNames extends Command
{
    protected $signature   = 'prayer:add-latin-names';
    protected $description = 'Populate atoll_latin and name_latin columns for prayer islands';

    // Dhivehi atoll code → Latin name
    private array $atollMap = [
        'ހއ'   => 'Haa Alif',
        'ހދ'   => 'Haa Dhaalu',
        'ށ'    => 'Shaviyani',
        'ނ'    => 'Noonu',
        'ރ'    => 'Raa',
        'ބ'    => 'Baa',
        'ޅ'    => 'Lhaviyani',
        'ކ'    => 'Kaafu',
        'އއ'   => 'Alif Alif',
        'އދ'   => 'Alif Dhaalu',
        'ވ'    => 'Vaavu',
        'މ'    => 'Meemu',
        'ފ'    => 'Faafu',
        'ދ'    => 'Dhaalu',
        'ތ'    => 'Thaa',
        'ލ'    => 'Laamu',
        'ގ.އ'  => 'Gaafu Alif',
        'ގ.ދ'  => 'Gaafu Dhaalu',
        'ޏ'    => 'Gnaviyani',
        'ސ'    => 'Seenu',
        'މާލެ' => 'Malé',
    ];

    // Dhivehi island name → Latin name
    private array $islandMap = [
        // Haa Alif
        'ތުރާކުނު'       => 'Thurakunu',
        'އުލިގަމު'       => 'Uligamu',
        'ބެރިންމަދޫ'     => 'Berinmadhoo',
        'ފިއްލަދޫ'       => 'Filladhoo',
        'ދިއްދޫ'         => 'Dhidhdhoo',
        'ތަކަންދޫ'       => 'Thakandhoo',
        'ކެލާ'           => 'Kelaa',
        'ވަށަފަރު'       => 'Vashafaru',
        'މާރަންދޫ'       => 'Maarandhoo',
        'ބާރަށް'         => 'Baarah',
        'އިހަވަންދޫ'     => 'Ihavandhoo',
        'ހޯރަފުށި'       => 'Hoarafushi',
        'މުޅަދޫ'         => 'Mulhadhoo',
        'މުރައިދޫ'       => 'Muraidhoo',
        'އުތީމު'         => 'Utheemu',
        'ހަތިފުށި'       => 'Hathifushi',

        // Haa Dhaalu
        'ހިރިމަރަދޫ'     => 'Hirimaradhoo',
        'ފިނޭ'           => 'Finey',
        'ހަނިމާދޫ'       => 'Hanimaadhoo',
        'ކުޅުދުއްފުށި'   => 'Kulhudhuffushi',
        'ކުމުންދޫ'       => 'Kumundhoo',
        'ކުރިންބި'       => 'Kurinbi',
        'ކުރިނބި'        => 'Kurinbi',
        'ނޮޅިވަރަންފަރު' => 'Nolhivaranfaru',
        'ނޮޅިވަރަމް'     => 'Nolhivaram',
        'ނޮޅިވަރަމު'     => 'Nolhivaram',
        'ނޭކުރެންދޫ'     => 'Neykurendhoo',
        'ނެއްލައިދޫ'     => 'Nellaidhoo',
        'ނައިވާދޫ'       => 'Naivaadhoo',
        'ވައިކަރަދޫ'     => 'Vaikaradhoo',
        'މަކުނުދޫ'       => 'Makunudhoo',
        'ފަރިދޫ'         => 'Faridhoo',
        'ހޮނޑައިދޫ'      => 'Hondaidhoo',
        'މާވައިދޫ'       => 'Maavaidhoo',

        // Shaviyani
        'ނޫމަރާ'         => 'Noomaraa',
        'ނަރުދޫ'         => 'Narudhoo',
        'މިލަންދޫ'       => 'Milandhoo',
        'މަރޮށި'         => 'Maroshi',
        'މާއުނގޫދޫ'      => 'Maaungoodhoo',
        'ލައިމަގު'       => 'Lhaimagu',
        'ޅައިމަގު'       => 'Lhaimagu',
        'ކޮމަންޑޫ'       => 'Komandoo',
        'ކަނޑިތީމު'      => 'Kanditheemu',
        'ގޮއިދޫ'         => 'Goidhoo',
        'ފުނަދޫ'         => 'Funadhoo',
        'ފޯކައިދޫ'       => 'Foakaidhoo',
        'ފޭދޫ'           => 'Feydhoo',
        'ފީވަށް'         => 'Feevah',
        'ފީވައް'         => 'Feevah',
        'ބިލެތްފަހި'     => 'Bileffahi',
        'މާކަނޑޫދޫ'      => 'Maakandhoodhoo',
        'ފިރުނބައިދޫ'    => 'Firunbaidhoo',

        // Noonu
        'ވެލިދޫ'         => 'Velidhoo',
        'މިލަދޫ'         => 'Miladhoo',
        'މަނަދޫ'         => 'Manadhoo',
        'މަގޫދޫ'         => 'Magoodhoo',
        'މާޅެންދޫ'       => 'Maalhendhoo',
        'މާފަރު'         => 'Maafaru',
        'ލޮހި'           => 'Lhohi',
        'ޅޮހި'           => 'Lhohi',
        'ލަންދޫ'         => 'Landhoo',
        'ކުޑަފަރި'       => 'Kudafari',
        'ކެންދިކުޅުދޫ'   => 'Kendhikulhudhoo',
        'ކެނދިކުޅުދޫ'    => 'Kendhikulhudhoo',
        'ހޮޅުދޫ'         => 'Holhudhoo',
        'ހެންބަދޫ'       => 'Henbadhoo',
        'ހެނބަދޫ'        => 'Henbadhoo',
        'ފޮއްދޫ'         => 'Foddhoo',
        'ތޮޅެންދޫ'       => 'Tholhendhoo',

        // Raa
        'ވާދޫ'           => 'Vaadhoo',
        'އުނގޫފާރު'      => 'Ungoofaaru',
        'ރަސްމާދޫ'       => 'Rasmaadhoo',
        'ރަސްގެތީމު'     => 'Rasgetheemu',
        'މީދޫ'           => 'Meedhoo',
        'މަޑުއްވަރި'     => 'Maduvvaree',
        'މާކުރަތު'       => 'Maakurathu',
        'ކިނޮޅަސް'       => 'Kinolhas',
        'ދުވާފަރު'       => 'Dhuvaafaru',
        'އިންނަމާދޫ'     => 'Innamaadhoo',
        'އިނގުރައިދޫ'    => 'Inguraidhoo',
        'ހުޅުދުއްފާރު'   => 'Hulhudhuffaaru',
        'ފައިނު'         => 'Fainu',
        'އަނގޮޅިތީމު'    => 'Angolhitheemu',
        'އަލިފުށި'       => 'Alifushi',
        'ގާއުނޑޫދޫ'      => 'Gaaundhoodhoo',
        'އުނގުލު'        => 'Ungulu',
        'ކަނދޮޅުދޫ'      => 'Kandholhudhoo',

        // Baa
        'ތުޅާދޫ'         => 'Thulhaadhoo',
        'ކިހާދޫ'         => 'Kihaadoo',
        'ގޮއިދޫ (ބ)'     => 'Goidhoo',
        'ދަރަވަންދޫ'     => 'Dharavandhoo',
        'ދޮންފަނު'       => 'Dhonfanu',
        'ކެންދޫ'         => 'Kendhoo',
        'ފެހެންދޫ'       => 'Fehendhoo',
        'ހިތާދޫ'         => 'Hithaadhoo',
        'މާޅޮސް'         => 'Maalhos',
        'ކަމަދޫ'         => 'Kamadhoo',
        'ކުޑަރިކިލު'     => 'Kudarikilu',
        'އޭދަފުށި'       => 'Eydhafushi',
        'ފުޅަދޫ'         => 'Fulhadhoo',

        // Lhaviyani
        'ހިންނަވަރު'     => 'Hinnavaru',
        'ކުރެންދޫ'       => 'Kurendhoo',
        'ނައިފަރު'       => 'Naifaru',
        'އޮޅުވެލިފުށި'   => 'Olhuvelifushi',

        // Kaafu
        'ދިއްފުށި'       => 'Dhiffushi',
        'ގާފަރު'         => 'Gaafaru',
        'ގުޅި'           => 'Gulhi',
        'ގުރައިދޫ'       => 'Guraidhoo',
        'ހިންމަފުށި'     => 'Himmafushi',
        'ހުރާ'           => 'Huraa',
        'ކާށިދޫ'         => 'Kaashidhoo',
        'މާފުށި'         => 'Maafushi',
        'ތުލުސްދޫ'       => 'Thulusdhoo',
        'މާލެ'           => 'Malé',
        'ހުޅުމާލެ'       => 'Hulhumalé',
        'ވިލިމާލެ'       => 'Vilimalé',

        // Alif Alif
        'ބޮޑުފޮޅުދޫ'     => 'Bodufolhudhoo',
        'ފެރިދޫ'         => 'Feridhoo',
        'ހިމަންދޫ'       => 'Himandhoo',
        'ހިމެންދޫ'       => 'Himandhoo',
        'މާޅޮސް (އއ)'    => 'Maalhos',
        'މަތިވެރި'       => 'Mathiveri',
        'ރަސްދޫ'         => 'Rasdhoo',
        'ތޮއްޑޫ'         => 'Thoddoo',
        'އުކުޅަސް'       => 'Ukulhas',

        // Alif Dhaalu
        'ދިގުރަށް'       => 'Dhigurah',
        'ދަނގެތި'        => 'Dhangethi',
        'ފެންފުށި'       => 'Fenfushi',
        'ހަންޏާމީދޫ'     => 'Hangnaameedhoo',
        'ކުނބުރުދޫ'      => 'Kunburudhoo',
        'މަހިބަދޫ'       => 'Mahibadhoo',
        'މަންދޫ'         => 'Mandhoo',
        'އޮމަދޫ'         => 'Omadhoo',
        'މާމިގިލި'       => 'Maamigili',

        // Vaavu
        'ފެލިދޫ'         => 'Felidhoo',
        'ފުލިދޫ'         => 'Fulidhoo',
        'ކިއޮދޫ'         => 'Keyodhoo',
        'ކެޔޮދޫ'         => 'Keyodhoo',
        'ރަކީދޫ'         => 'Rakeedhoo',
        'ތިނަދޫ (ވ)'     => 'Thinadhoo',

        // Meemu
        'ދިއްގަރު'       => 'Dhiggaru',
        'ކޮޅުފުށި'       => 'Kolhufushi',
        'މަޑުވަރި'       => 'Maduvvaree',
        'މުލައް'         => 'Mulah',
        'މުލި'           => 'Muli',
        'ނާލާފުށި'       => 'Naalaafushi',
        'ރައިމަންދޫ'     => 'Raimmandhoo',
        'ވޭވަށް'         => 'Veyvah',
        'ރަތްމަންދޫ'     => 'Rathmandhoo',

        // Faafu
        'ބިލެހްދޫ'       => 'Bileddhoo',
        'ބިލެތްދޫ'       => 'Bileddhoo',
        'ދަރަންބޫދޫ'     => 'Dharanboodhoo',
        'ދަރަނބޫދޫ'      => 'Dharanboodhoo',
        'ފީއަލި'         => 'Feeali',
        'ނިލަންދޫ (ފ)'   => 'Nilandhoo',
        'ނިލަންދޫ'       => 'Nilandhoo',

        // Dhaalu
        'ބަނޑިދޫ'        => 'Bandidhoo',
        'ހުޅުދެލި'       => 'Hulhudheli',
        'ކުޑަހުވަދޫ'     => 'Kudahuvadhoo',
        'މާއެނބޫދޫ'      => 'Maaenboodhoo',
        'ރިނބުދޫ'        => 'Rinbudhoo',
        'ގެމެންދޫ'       => 'Gemendhoo',
        'ވާނި'           => 'Vaani',

        // Thaa
        'ބުރުނި'         => 'Buruni',
        'ދިޔަމިގިލި'     => 'Dhiyamigili',
        'ގާދިއްފުށި'     => 'Gaadhiffushi',
        'ހިރިލަންދޫ'     => 'Hirilandhoo',
        'ކަނޑޫދޫ'        => 'Kandoodhoo',
        'ކިނބިދޫ'        => 'Kinbidhoo',
        'މަޑިފުށި'       => 'Madifushi',
        'އޮމަދޫ (ތ)'     => 'Omadhoo',
        'ތިމަރަފުށި'     => 'Thimarafushi',
        'ވޭމަންދޫ'       => 'Veymandoo',
        'ވޭމަންޑޫ'       => 'Veymandoo',
        'ވިލުފުށި'       => 'Vilufushi',
        'ވަންދޫ'         => 'Vandhoo',

        // Laamu
        'ފޮނަދޫ'         => 'Fonadhoo',
        'ގަން'           => 'Gan',
        'ހިތަދޫ (ލ)'     => 'Hithadhoo',
        'އިސްދޫ'         => 'Isdhoo',
        'ކަލައިދޫ'       => 'Kalaidhoo',
        'ކަޅައިދޫ'       => 'Kalaidhoo',
        'ކުނަހަންދޫ'     => 'Kunahandhoo',
        'ދަނބިދޫ'        => 'Dhanbidhoo',
        'ގާދޫ'           => 'Gaadhoo',
        'މާވަށް'         => 'Maavah',
        'މާންދޫ'         => 'Maandhoo',
        'މުންދޫ'         => 'Mundhoo',
        'މުންޑޫ'         => 'Mundhoo',
        'ވަށަފަރު (ލ)'   => 'Vashafaru',
        'މާބައިދޫ'       => 'Maabaidhoo',

        // Gaafu Alif
        'ދާންދޫ'         => 'Dhaandhoo',
        'ދެއްވަދޫ'       => 'Dhevvadhoo',
        'ގެމަނަފުށި'     => 'Gemanafushi',
        'ކަނޑުހުޅުދޫ'    => 'Kanduhulhudhoo',
        'ކޮލަމާފުށި'     => 'Kolamaafushi',
        'ކޮންދޭ'         => 'Kondey',
        'ކޮނޑޭ'          => 'Kondey',
        'މާމެންދޫ'       => 'Maamendhoo',
        'ނިލަންދޫ (ގ.އ)' => 'Nilandhoo',
        'ވިލިނގިލި'      => 'Villingili',
        'ދިޔަދޫ'         => 'Dhiyadhoo',

        // Gaafu Dhaalu
        'ފަރެސްމާތޮޑާ'   => 'Faresmaathodaa',
        'ފަރެސް'         => 'Fares',
        'މާތޮޑާ'         => 'Maathodaa',
        'ގައްދޫ'         => 'Gadhdhoo',
        'ހޯނޑެއްދޫ'      => 'Hoandeddhoo',
        'ނަޑެއްލާ'       => 'Nadella',
        'ނަޑައްލާ'       => 'Nadella',
        'ތިނަދޫ'         => 'Thinadhoo',
        'ވާދޫ (ގ.ދ)'     => 'Vaadhoo',
        'މަޑަވެލި'       => 'Madaveli',
        'ރަތަފަންދޫ'     => 'Rathafandhoo',
        'ފިޔޯރީ'         => 'Fiyoree',

        // Gnaviyani
        'ފުވައްމުލައް'   => 'Fuvahmulah',

        // Seenu
        'ހިތަދޫ'         => 'Hithadhoo',
        'ފޭދޫ (ސ)'       => 'Feydhoo',
        'ހުޅުދޫ'         => 'Hulhudhoo',
        'ހުޅުމީދޫ'       => 'Hulhumeedhoo',
        'މަރަދޫ'         => 'Maradhoo',
        'މަރަދޫ-ފޭދޫ'    => 'Maradhoo-Feydhoo',
        'މަރަދޫފޭދޫ'     => 'Maradhoo-Feydhoo',
        'މީދޫ (ސ)'       => 'Meedhoo',
        'ގަން (ސ)'        => 'Gan',
    ];

    public function handle(): void
    {
        $islands = DB::table('prayer_islands')->get(['id', 'atoll', 'name']);
        $updated = 0;

        foreach ($islands as $island) {
            $atollLatin  = $this->atollMap[$island->atoll]  ?? null;
            $nameLatin   = $this->islandMap[$island->name]  ?? null;

            if ($atollLatin || $nameLatin) {
                DB::table('prayer_islands')
                    ->where('id', $island->id)
                    ->update(array_filter([
                        'atoll_latin' => $atollLatin,
                        'name_latin'  => $nameLatin,
                    ], fn($v) => $v !== null));
                $updated++;
            }
        }

        $total = $islands->count();
        $this->info("Updated {$updated} / {$total} islands with Latin names.");

        // Show unmatched islands so user can add them
        $unmatched = $islands->filter(fn($i) => !isset($this->islandMap[$i->name]));
        if ($unmatched->count()) {
            $this->warn("Islands without Latin names ({$unmatched->count()}):");
            foreach ($unmatched as $i) {
                $this->line("  [{$i->id}] {$i->atoll} — {$i->name}");
            }
        }
    }
}
