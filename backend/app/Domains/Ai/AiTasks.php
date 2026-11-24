<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use App\Domains\Labels\Nutrition;
use App\Domains\Reporting\Services\ItemsSold;
use App\Domains\Reporting\Services\SalesTrend;
use Carbon\CarbonImmutable;

/**
 * Every job the assistant does, with its instructions and the shape of its answer
 * (owner, 2026-11-24). Each is a draft or a suggestion a person checks: nothing here saves,
 * sends or prints. The caller asks AiFeatures::mustBeOn() first. A new job is a method
 * here, never a prompt written in a controller.
 */
class AiTasks
{
    private const WHO = 'You help the staff of Bake & Grill, a café and bakery in Malé, Maldives. Prices are in Maldivian rufiyaa, written "MVR 45.00". Write plainly and warmly, as a small local business would, with no emoji unless asked and no long dashes.';

    private const DHIVEHI = 'Dhivehi is written in Thaana script, in the everyday register used in Malé. Keep "Bake & Grill", numbers, prices, phone numbers, links, codes and anything inside {{double braces}} or {single braces} exactly as they are. A dish with no Dhivehi name of its own is written by its sound in Thaana.';

    public function __construct(private readonly Assistant $assistant) {}

    /**
     * A reply to a customer, for staff to edit and send.
     *
     * @param array<string, mixed> $about what the customer wrote and what is known about it
     */
    public function draftReply(string $kind, array $about): string
    {
        $what = match ($kind) {
            'review' => 'a public reply shown under the customer\'s review as "Reply from Bake & Grill"',
            'complaint' => 'a reply to a customer who made a complaint, sent to them by text message',
            'question' => 'a public answer to a customer\'s question about a dish, shown on the dish\'s page',
            default => 'a public reply to a comment on one of our social media posts',
        };
        $rules = <<<TXT
            Write {$what}. A member of staff will read and change it before it goes out.

            - Two to four short sentences. Answer in the language the customer wrote in (English, or Dhivehi in Thaana).
            - Use only what you are given. Never state a fact about the order, the dish, its ingredients, opening hours or a price that is not in what you are given; when the answer needs something you do not have, say the team will check and get back, or leave a short gap in [square brackets] for staff to fill.
            - Never promise a refund, a replacement, a discount, free food or a compensation, and never say who was at fault. Staff decide those.
            - For a complaint or a poor review: thank them, say sorry that it was not right, and say it has been passed to the team. For a good review: thank them simply.
            - A question that touches allergies or what a dish contains ends with: Please tell staff about any allergy when you order.
            - No greeting line with a made-up name, no signature, no hashtags.
            TXT;
        $out = $this->assistant->ask(self::WHO . "\n\n" . $rules, json_encode($about, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), self::obj(['reply' => 'string']));

        return trim((string) ($out['reply'] ?? ''));
    }

    /** English into Dhivehi, for a Dhivehi speaker to check. */
    public function dhivehi(string $text, string $kind = 'text'): string
    {
        $note = match ($kind) {
            'name' => 'This is the name of a dish or product: answer with the name only, short.',
            'sms' => 'This is a text message to a customer: keep it as short as the English, on one line.',
            'label' => 'This is wording printed on a food label: short and exact.',
            default => 'Keep the same meaning, tone and line breaks.',
        };
        $out = $this->assistant->ask(
            self::WHO . "\n\nTranslate the English you are given into Dhivehi. " . self::DHIVEHI . ' ' . $note . ' Answer with the translation only.',
            $text,
            self::obj(['dv' => 'string']),
        );

        return trim((string) ($out['dv'] ?? ''));
    }

    /**
     * Dhivehi for ingredient words on food labels.
     *
     * @param list<string> $words
     * @return array<string, array{dv: string, sure: bool}> by the English word
     */
    public function glossary(array $words): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given English ingredient words printed on food labels. Give the Dhivehi word for each, as a Maldivian shopper would read it on a pack. " . self::DHIVEHI . ' An ingredient with no Dhivehi word in common use (many spices and additives) is written by its sound in Thaana. Set "sure" to false when you are guessing or when two words are in use; give "" when you do not know. Answer for every word, in the order given, with the English exactly as given.',
            json_encode(array_values($words), JSON_UNESCAPED_UNICODE),
            ['type' => 'object', 'additionalProperties' => false, 'required' => ['words'], 'properties' => ['words' => ['type' => 'array', 'items' => self::obj(['en' => 'string', 'dv' => 'string', 'sure' => 'boolean'])]]],
        );
        $found = [];
        foreach ((array) ($out['words'] ?? []) as $row) {
            $en = trim((string) ($row['en'] ?? ''));
            $dv = trim((string) ($row['dv'] ?? ''));
            if ($en !== '' && $dv !== '' && in_array($en, $words, true)) {
                $found[$en] = ['dv' => $dv, 'sure' => (bool) ($row['sure'] ?? false)];
            }
        }

        return $found;
    }

    /**
     * Typical nutrition per 100 g for raw ingredients.
     *
     * @param array<int, string> $names inventory item id => name
     * @return array<int, array<string, float>> by id, only the ones the assistant knows
     */
    public function nutrition(array $names): array
    {
        $fields = ['id' => 'integer', 'known' => 'boolean'] + array_fill_keys(array_keys(Nutrition::FIELDS), 'number');
        $list = [];
        foreach ($names as $id => $name) {
            $list[] = ['id' => (int) $id, 'name' => (string) $name];
        }
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given kitchen ingredients by name. For each, give typical nutrition values per 100 g of the ingredient as bought (raw, uncooked, as sold), from standard food composition tables: energy in kcal, and fat, saturates, carbohydrate, sugars, protein and salt in grams. Salt is sodium times 2.5. Set \"known\" to false, with zeros, for anything that is not a food, is a mix you cannot place (a house sauce, \"masala\"), or whose name is unclear: a wrong figure printed on a label is worse than a blank. Answer for every id given.",
            json_encode($list, JSON_UNESCAPED_UNICODE),
            ['type' => 'object', 'additionalProperties' => false, 'required' => ['items'], 'properties' => ['items' => ['type' => 'array', 'items' => self::obj($fields)]]],
            maxTokens: 8000,
        );
        $found = [];
        foreach ((array) ($out['items'] ?? []) as $row) {
            $id = (int) ($row['id'] ?? 0);
            if (!isset($names[$id]) || empty($row['known'])) {
                continue;
            }
            $values = [];
            foreach (array_keys(Nutrition::FIELDS) as $k) {
                $v = (float) ($row[$k] ?? 0);
                $values[$k] = round(max(0.0, min($k === 'kcal' ? 900.0 : 100.0, $v)), $k === 'kcal' ? 0 : 1);
            }
            $found[$id] = $values;
        }

        return $found;
    }

    /**
     * The caption for a social post.
     *
     * @param array<string, mixed> $post the words on the picture
     * @return array{en: string, dv: string}
     */
    public function caption(array $post): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nWrite the caption that goes under a social media post (Facebook, Instagram), from the words on its picture. Two or three short lines: what it is and why someone would want it today, then how to order, with the link when one is given. Use only the facts given: never invent a price, an offer, a date or an ingredient. At most three hashtags, on the last line. Give it in English, and the same in Dhivehi. " . self::DHIVEHI,
            json_encode($post, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            self::obj(['en' => 'string', 'dv' => 'string']),
        );

        return ['en' => trim((string) ($out['en'] ?? '')), 'dv' => trim((string) ($out['dv'] ?? ''))];
    }

    /**
     * The subject and opening words of a newsletter issue.
     *
     * @param array<string, mixed> $picks what the issue will show (new dishes, specials, an offer, coming soon)
     * @return array{subject_en: string, subject_dv: string, body_en: string, body_dv: string}
     */
    public function newsletter(array $picks, string $hint = ''): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nWrite the subject line and the opening words of our email newsletter. Under your words the email lists the dishes and the offer you are given, with their names, prices and pictures, so do not list them again: say what is new in two short paragraphs and invite the reader to order. The subject is under 60 characters and says the main news. Use only the facts given; never invent a dish, a price, a date or an offer. Give both in English, and the same in Dhivehi. " . self::DHIVEHI,
            json_encode(['what_the_issue_shows' => $picks, 'what_the_owner_wants_to_say' => $hint], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            self::obj(['subject_en' => 'string', 'subject_dv' => 'string', 'body_en' => 'string', 'body_dv' => 'string']),
        );

        return array_map(fn ($v) => trim((string) $v), array_intersect_key($out, array_flip(['subject_en', 'subject_dv', 'body_en', 'body_dv'])) + ['subject_en' => '', 'subject_dv' => '', 'body_en' => '', 'body_dv' => '']);
    }

    /**
     * A customer's purchase order (a scan, a photo or a PDF) as the invoice form's draft.
     *
     * @return array<string, mixed> the admin's PoDraft, less `missing` and `mended`
     */
    public function readPo(string $bytes, string $mime): array
    {
        $line = self::obj(['description' => 'string', 'quantity' => 'number', 'unit' => 'string', 'unit_price' => 'number', 'amount' => 'number']);
        $schema = self::obj([
            'is_po' => 'boolean', 'po_number' => 'string', 'order_date' => 'string', 'delivery_date' => 'string', 'bill_to' => 'string', 'bill_address' => 'string',
            'bill_tin' => 'string', 'bill_email' => 'string', 'deliver_to' => 'string', 'payment_term' => 'string', 'currency' => 'string',
            'subtotal' => 'number', 'tax' => 'number', 'total' => 'number',
        ]);
        $schema['properties']['lines'] = ['type' => 'array', 'items' => $line];
        $schema['required'][] = 'lines';

        $rules = <<<'TXT'
            You are given a purchase order that a customer (a resort, a company, a school) sent to us, the supplier. Read it into the fields so that staff can make our invoice from it. A person checks every field against the paper.

            - Read what is there and never fill a gap with a likely value: text you cannot read is "", a figure you cannot read is 0.
            - bill_to, bill_address, bill_tin and bill_email are the customer's: the block the order says to issue the invoice to, else whoever issued the order. Never our own name, address or TIN (we are the supplier or vendor named on it).
            - deliver_to is where the goods are to go, when the order says.
            - Dates as YYYY-MM-DD, or "" when not given. currency as the three letters on the order, "MVR" when it only says rufiyaa or nothing.
            - One line per row of goods, in the order's own order, with the quantity, the unit as written, the price of one and the row's amount, all before tax unless the order prices include it. Leave out subtotal, tax and total rows.
            - subtotal, tax and total as printed, 0 when not printed.
            - is_po is false when the file is not an order for goods, or cannot be read at all.
            TXT;
        $out = $this->assistant->ask(self::WHO . "\n\n" . $rules, 'Read this purchase order.', $schema, ['bytes' => $bytes, 'mime' => $mime], timeout: 120, maxTokens: 8000);
        if (empty($out['is_po'])) {
            throw new AssistantUnavailable('The assistant could not read this file as a purchase order.');
        }
        $lines = [];
        foreach ((array) ($out['lines'] ?? []) as $l) {
            $desc = trim((string) ($l['description'] ?? ''));
            if ($desc === '') {
                continue;
            }
            $lines[] = ['description' => mb_substr($desc, 0, 255), 'quantity' => (float) ($l['quantity'] ?? 0), 'unit' => mb_substr(trim((string) ($l['unit'] ?? '')), 0, 30), 'unit_price' => (float) ($l['unit_price'] ?? 0), 'amount' => (float) ($l['amount'] ?? 0)];
        }
        $text = fn (string $k, int $max = 255): string => mb_substr(trim((string) ($out[$k] ?? '')), 0, $max);
        $date = fn (string $k): string => preg_match('/^\d{4}-\d{2}-\d{2}$/', $text($k)) ? $text($k) : '';
        $money = fn (string $k): ?float => ((float) ($out[$k] ?? 0)) > 0 ? round((float) $out[$k], 2) : null;

        return [
            'po_number' => $text('po_number', 60), 'order_date' => $date('order_date'), 'delivery_date' => $date('delivery_date'),
            'bill_to' => $text('bill_to'), 'bill_address' => $text('bill_address', 500), 'bill_tin' => $text('bill_tin', 60), 'bill_email' => $text('bill_email', 160),
            'deliver_to' => $text('deliver_to', 500), 'payment_term' => $text('payment_term', 120), 'currency' => $text('currency', 3) ?: 'MVR',
            'lines' => $lines, 'subtotal' => $money('subtotal'), 'tax' => $money('tax'), 'total' => $money('total'),
        ];
    }

    /**
     * A plain answer to a question about sales, from our own reports (the Telegram bot).
     * Two steps: the assistant says which period the question is about, the reports are
     * run here, and the assistant words the answer from their figures alone.
     */
    public function answer(string $question, CarbonImmutable $today): string
    {
        $pick = $this->assistant->ask(
            self::WHO . "\n\nA manager asks a question about the business. Say which dates it is about, so the sales reports can be run. Today is " . $today->toDateString() . ' (' . $today->format('l') . '); weeks start on Sunday. "from" and "to" as YYYY-MM-DD, both today when no period is named, never after today. "about" is false when the question is not about sales, orders, items sold, payment methods, order types or staff sales (for those we have figures); then the dates do not matter.',
            $question,
            self::obj(['about' => 'boolean', 'from' => 'string', 'to' => 'string']),
        );
        if (empty($pick['about'])) {
            return 'I can answer questions about sales, orders, items sold, payment methods, order types and staff sales. For anything else, please look in Admin.';
        }
        try {
            $from = CarbonImmutable::parse((string) $pick['from'])->startOfDay();
            $to = CarbonImmutable::parse((string) $pick['to'])->startOfDay();
        } catch (\Throwable) {
            $from = $to = $today;
        }
        $to = $to->greaterThan($today) ? $today : $to;
        $from = $from->greaterThan($to) ? $to : $from;
        // A year at most: the reports read every order in the range.
        $from = $from->lessThan($to->subDays(366)) ? $to->subDays(366) : $from;

        $days = (int) $from->diffInDays($to) + 1;
        $sales = app(SalesTrend::class)->report($from, $to, $days > 62 ? 'month' : 'day');
        $items = app(ItemsSold::class)->report($from, $to);
        $figures = [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days],
            'totals' => $sales['totals'] ?? [],
            'the_period_just_before' => ['dates' => $sales['previous'] ?? [], 'totals' => $sales['previous_totals'] ?? []],
            'over_time' => $sales['series'] ?? [],
            'by_order_type' => $sales['by_type'] ?? [],
            'by_payment_method' => $sales['by_payment'] ?? [],
            'by_staff' => $sales['by_staff'] ?? [],
            'items_sold' => array_map(
                fn (array $i) => ['name' => $i['name'], 'category' => $i['category'], 'qty' => $i['qty'], 'sales' => $i['sales'], 'orders' => $i['orders']],
                array_slice((array) ($items['items'] ?? []), 0, 150),
            ),
        ];
        $out = $this->assistant->ask(
            self::WHO . "\n\nAnswer the manager's question from the figures you are given, which come from our own sales reports for the dates shown. Lead with the answer in one sentence, then at most four short lines of detail. Use only these figures: when they do not hold the answer, say what is missing. Always say which dates the answer covers. Plain text, no tables, no markdown.",
            json_encode(['question' => $question, 'figures' => $figures], JSON_UNESCAPED_UNICODE),
            self::obj(['answer' => 'string']),
            timeout: 60,
        );

        return trim((string) ($out['answer'] ?? '')) ?: 'I could not work that one out. Try asking it another way.';
    }

    // ── Suggestions that wait for approval (AiSuggestions) ───────────────

    /**
     * Dhivehi for dishes that have none.
     *
     * @param list<array{id: int, name: string, short: string, want_name: bool, want_short: bool}> $dishes
     * @return array<int, array{name_dv: string, short_dv: string}> by dish id
     */
    public function menuDhivehi(array $dishes): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given dishes from our menu. For each, give the Dhivehi name when want_name is true and the Dhivehi of the short line when want_short is true; give \"\" for what is not wanted. " . self::DHIVEHI . ' A name is short, as it would be said at the counter. Answer for every id given.',
            json_encode($dishes, JSON_UNESCAPED_UNICODE),
            self::rows(['id' => 'integer', 'name_dv' => 'string', 'short_dv' => 'string']),
            maxTokens: 12000,
        );
        $known = array_column($dishes, null, 'id');
        $found = [];
        foreach ((array) ($out['rows'] ?? []) as $r) {
            $id = (int) ($r['id'] ?? 0);
            if (!isset($known[$id])) {
                continue;
            }
            $found[$id] = [
                'name_dv' => $known[$id]['want_name'] ? mb_substr(trim((string) ($r['name_dv'] ?? '')), 0, 120) : '',
                'short_dv' => $known[$id]['want_short'] ? mb_substr(trim((string) ($r['short_dv'] ?? '')), 0, 140) : '',
            ];
        }

        return $found;
    }

    /**
     * Dishes that sit in the wrong section of the menu.
     *
     * @param list<array{id: int, name: string, in: int}> $dishes
     * @param array<int, string> $sections section id => its full name ("Mains › Momo")
     * @return list<array{id: int, to: int, why: string}> only the dishes to move
     */
    public function misplacedDishes(array $dishes, array $sections): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given the sections of our menu and every dish with the section it is in now. Name only the dishes that are plainly in the wrong section, with the section they belong in and a few words why. Most dishes are where they should be: a dish that could reasonably sit in either of two sections stays where it is, and you never invent a section. An empty list is a good answer.",
            json_encode(['sections' => $sections, 'dishes' => $dishes], JSON_UNESCAPED_UNICODE),
            self::rows(['id' => 'integer', 'to' => 'integer', 'why' => 'string']),
            maxTokens: 8000,
        );
        $now = array_column($dishes, 'in', 'id');
        $moves = [];
        foreach ((array) ($out['rows'] ?? []) as $r) {
            $id = (int) ($r['id'] ?? 0);
            $to = (int) ($r['to'] ?? 0);
            if (isset($now[$id], $sections[$to]) && $now[$id] !== $to) {
                $moves[] = ['id' => $id, 'to' => $to, 'why' => mb_substr(trim((string) ($r['why'] ?? '')), 0, 200)];
            }
        }

        return $moves;
    }

    /**
     * New sections worth having, each with the dishes that would go in it.
     *
     * @param list<array{id: int, name: string, in: int}> $dishes
     * @param list<array{id: int, name: string, parent: int}> $sections parent 0 for a main section
     * @return list<array{name: string, parent: int, ids: list<int>, why: string}> parent 0 for a new main section
     */
    public function newSections(array $dishes, array $sections): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given the sections of our menu (a main section has parent 0, a sub-section its main section's id) and every dish with the section it is in now. Propose new sections only where the menu would plainly be easier to read: a sub-section inside a crowded main section for three or more dishes of one kind (all the momo, all the fried rice, all the fresh juices), or a new main section (parent 0) for three or more dishes that belong in none of the sections we have. Give the name a customer would look for, in the style of our section names, the parent, the ids of the dishes to move in, and a few words why. Never propose a section we already have under any wording, never one that would take every dish out of a section, never a section for fewer than three dishes, and put no dish in two proposals. Most menus need few or none: an empty list is a good answer.",
            json_encode(['sections' => $sections, 'dishes' => $dishes], JSON_UNESCAPED_UNICODE),
            ['type' => 'object', 'additionalProperties' => false, 'required' => ['rows'], 'properties' => ['rows' => ['type' => 'array', 'items' => [
                'type' => 'object', 'additionalProperties' => false, 'required' => ['name', 'parent', 'ids', 'why'],
                'properties' => ['name' => ['type' => 'string'], 'parent' => ['type' => 'integer'], 'ids' => ['type' => 'array', 'items' => ['type' => 'integer']], 'why' => ['type' => 'string']],
            ]]]],
            maxTokens: 8000,
        );
        $key = fn (string $n): string => preg_replace('/[^a-z0-9]+/', '', mb_strtolower($n)) ?? '';
        $main = [];
        $taken = [];
        $size = [];
        foreach ($sections as $sec) {
            if ((int) $sec['parent'] === 0) {
                $main[(int) $sec['id']] = true;
            }
            $taken[$key((string) $sec['name'])] = true;
        }
        $in = array_column($dishes, 'in', 'id');
        foreach ($in as $cat) {
            $size[$cat] = ($size[$cat] ?? 0) + 1;
        }
        $used = [];
        $found = [];
        foreach ((array) ($out['rows'] ?? []) as $r) {
            $name = mb_substr(trim((string) ($r['name'] ?? '')), 0, 60);
            $parent = (int) ($r['parent'] ?? 0);
            $k = $key($name);
            if ($k === '' || isset($taken[$k]) || ($parent !== 0 && !isset($main[$parent]))) {
                continue;
            }
            $ids = [];
            $leaving = [];
            foreach ((array) ($r['ids'] ?? []) as $id) {
                $id = (int) $id;
                if (isset($in[$id]) && !isset($used[$id]) && !in_array($id, $ids, true)) {
                    $ids[] = $id;
                    $leaving[$in[$id]] = ($leaving[$in[$id]] ?? 0) + 1;
                }
            }
            // A proposal that would empty a section is a rename, which is not ours to make.
            $empties = false;
            foreach ($leaving as $cat => $n) {
                $empties = $empties || $n >= ($size[$cat] ?? 0);
            }
            if (count($ids) < 3 || $empties) {
                continue;
            }
            foreach ($ids as $id) {
                $used[$id] = true;
            }
            $taken[$k] = true;
            $found[] = ['name' => $name, 'parent' => $parent, 'ids' => $ids, 'why' => mb_substr(trim((string) ($r['why'] ?? '')), 0, 200)];
            if (count($found) >= 8) {
                break;
            }
        }

        return $found;
    }

    /**
     * A better order for the dishes of each section.
     *
     * @param list<array{section: int, name: string, dishes: list<array{id: int, name: string, price: float}>}> $sections in today's order
     * @return array<int, array{ids: list<int>, why: string}> by section id, only where the order should change
     */
    public function dishOrder(array $sections): array
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given sections of our menu, each with its dishes in the order customers see them now. Where a section would read better, give its dishes in a new order: like with like (the same dish in its flavours together), plain before spicy or special, small before large, and what a meal starts with before what it ends with. Give every dish id of that section exactly once. Leave out a section whose order is already sensible: a different order that is no clearer is not worth a change.",
            json_encode($sections, JSON_UNESCAPED_UNICODE),
            ['type' => 'object', 'additionalProperties' => false, 'required' => ['rows'], 'properties' => ['rows' => ['type' => 'array', 'items' => [
                'type' => 'object', 'additionalProperties' => false, 'required' => ['section', 'ids', 'why'],
                'properties' => ['section' => ['type' => 'integer'], 'ids' => ['type' => 'array', 'items' => ['type' => 'integer']], 'why' => ['type' => 'string']],
            ]]]],
            maxTokens: 12000,
        );
        $have = [];
        foreach ($sections as $sec) {
            $have[$sec['section']] = array_column($sec['dishes'], 'id');
        }
        $orders = [];
        foreach ((array) ($out['rows'] ?? []) as $r) {
            $sec = (int) ($r['section'] ?? 0);
            $ids = array_values(array_unique(array_map('intval', (array) ($r['ids'] ?? []))));
            // Every dish of the section, each once, and not the order it already has.
            if (!isset($have[$sec]) || $ids === $have[$sec] || count($ids) !== count($have[$sec]) || array_diff($have[$sec], $ids) !== []) {
                continue;
            }
            $orders[$sec] = ['ids' => $ids, 'why' => mb_substr(trim((string) ($r['why'] ?? '')), 0, 200)];
        }

        return $orders;
    }

    /**
     * A category for inventory items that have none.
     *
     * @param array<int, string> $items inventory item id => name
     * @param array<int, string> $categories category id => name
     * @return array<int, int> item id => category id, only where one of the categories fits
     */
    public function inventoryCategories(array $items, array $categories): array
    {
        $list = [];
        foreach ($items as $id => $name) {
            $list[] = ['id' => (int) $id, 'name' => (string) $name];
        }
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given our stockroom's categories and items that have no category. Put each item in the category it belongs to. Use only the categories given; give 0 for an item none of them fits or whose name is unclear.",
            json_encode(['categories' => $categories, 'items' => $list], JSON_UNESCAPED_UNICODE),
            self::rows(['id' => 'integer', 'category' => 'integer']),
            maxTokens: 8000,
        );
        $found = [];
        foreach ((array) ($out['rows'] ?? []) as $r) {
            $id = (int) ($r['id'] ?? 0);
            $cat = (int) ($r['category'] ?? 0);
            if (isset($items[$id], $categories[$cat])) {
                $found[$id] = $cat;
            }
        }

        return $found;
    }

    /**
     * Inventory items that look like the same product entered twice.
     *
     * @param array<int, string> $items inventory item id => "name (unit)"
     * @return list<array{a: int, b: int, why: string}>
     */
    public function inventoryDuplicates(array $items): array
    {
        $list = [];
        foreach ($items as $id => $name) {
            $list[] = ['id' => (int) $id, 'name' => (string) $name];
        }
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are given every item in our stockroom. Name the pairs that are the same product entered twice: the same thing under two spellings, an abbreviation and its full name, or the same thing with and without its brand or pack size. Two different products that share a word (chicken breast and chicken thigh, white sugar and brown sugar) are not a pair. An empty list is a good answer.",
            json_encode($list, JSON_UNESCAPED_UNICODE),
            self::rows(['a' => 'integer', 'b' => 'integer', 'why' => 'string']),
            maxTokens: 8000,
        );
        $pairs = [];
        foreach ((array) ($out['rows'] ?? []) as $r) {
            $a = (int) ($r['a'] ?? 0);
            $b = (int) ($r['b'] ?? 0);
            if ($a !== $b && isset($items[$a], $items[$b])) {
                [$lo, $hi] = [min($a, $b), max($a, $b)];
                $pairs["{$lo}-{$hi}"] = ['a' => $lo, 'b' => $hi, 'why' => mb_substr(trim((string) ($r['why'] ?? '')), 0, 200)];
            }
        }

        return array_values($pairs);
    }

    // ── Looking at pictures ──────────────────────────────────────────────

    /**
     * One look at a dish's photo: where the dish is, what is wrong with the photo, and
     * whether it would cut out cleanly.
     *
     * @param array{bytes: string, mime: string} $picture
     * @return array{box: array{x: float, y: float, w: float, h: float}, issues: list<string>, plain: bool, note: string}
     */
    public function dishPhoto(array $picture, string $dish, string $about = ''): array
    {
        $issues = ['blurry', 'dark', 'cut_off', 'text_or_logo', 'wrong_dish', 'cluttered'];
        $schema = self::obj(['x' => 'number', 'y' => 'number', 'w' => 'number', 'h' => 'number', 'plain_background' => 'boolean', 'note' => 'string']);
        $schema['properties']['issues'] = ['type' => 'array', 'items' => ['type' => 'string', 'enum' => $issues]];
        $schema['required'][] = 'issues';
        $rules = <<<'TXT'
            You are shown the photo a menu uses for one dish, with the dish's name. Answer about this photo only.

            - x, y, w, h: the box round the food and its plate or bowl, as shares of the picture from 0 to 1 (x and y are its top left corner). Take in the whole plate and anything that belongs to the serving, such as a dip. Leave out the empty table round it.
            - issues: only the ones that are plainly true. "blurry" when the food is out of focus; "dark" when it is hard to see for lack of light; "cut_off" when part of the dish is outside the picture; "text_or_logo" when writing, a watermark or a logo is on the picture; "wrong_dish" only when the food shown is clearly not what the name says (not for a doubt); "cluttered" when other things crowd the dish. A good photo has none.
            - plain_background: true when the dish stands on one plain, even colour with nothing else in the picture, so it could be cut out cleanly.
            - note: one short sentence for the person who looks after the menu, only when there is an issue. Else "".
            TXT;
        $out = $this->assistant->ask(self::WHO . "\n\n" . $rules, 'The dish: ' . $dish . ($about !== '' ? "\nWhat the menu says: " . $about : ''), $schema, $picture, timeout: 60);
        $n = fn (string $k, float $d): float => max(0.0, min(1.0, (float) ($out[$k] ?? $d)));

        return [
            'box' => ['x' => $n('x', 0.0), 'y' => $n('y', 0.0), 'w' => $n('w', 1.0), 'h' => $n('h', 1.0)],
            'issues' => array_values(array_intersect($issues, array_map('strval', (array) ($out['issues'] ?? [])))),
            'plain' => (bool) ($out['plain_background'] ?? false),
            'note' => mb_substr(trim((string) ($out['note'] ?? '')), 0, 200),
        ];
    }

    /**
     * What a library picture shows, for finding it later and for screen readers.
     *
     * @param array{bytes: string, mime: string} $picture
     * @return array{alt: string, tags: list<string>}
     */
    public function describePicture(array $picture, string $title = ''): array
    {
        $schema = self::obj(['alt' => 'string']);
        $schema['properties']['tags'] = ['type' => 'array', 'items' => ['type' => 'string']];
        $schema['required'][] = 'tags';
        $out = $this->assistant->ask(
            self::WHO . "\n\nYou are shown a picture from our media library. Give \"alt\": one plain sentence of at most 120 characters saying what it shows, as you would tell someone who cannot see it (no \"image of\", no opinions). Give \"tags\": three to six lower-case words or two-word phrases someone would type to find it (the food, how it is cooked, what it is served in, the setting). Describe only what is in the picture.",
            $title !== '' ? 'Its title in the library: ' . $title : 'It has no title.',
            $schema,
            $picture,
            timeout: 60,
        );
        $tags = [];
        foreach ((array) ($out['tags'] ?? []) as $t) {
            $t = mb_strtolower(trim((string) $t));
            if ($t !== '' && mb_strlen($t) <= 30 && !in_array($t, $tags, true)) {
                $tags[] = $t;
            }
        }

        return ['alt' => mb_substr(trim((string) ($out['alt'] ?? '')), 0, 160), 'tags' => array_slice($tags, 0, 6)];
    }

    /**
     * A note on a customer's review photo, for whoever moderates it.
     *
     * @param array{bytes: string, mime: string} $picture
     */
    public function reviewPhoto(array $picture, string $dish = ''): string
    {
        $out = $this->assistant->ask(
            self::WHO . "\n\nA customer attached this photo to a review" . ($dish !== '' ? ' of the dish named below' : '') . '. A member of staff decides whether the review is shown; help them with one short sentence saying what the photo shows. Set "concern" to true only when it should not be shown publicly as it is: a person\'s face close up, a child, a document or screen with personal details, something indecent or offensive, or nothing to do with food or our shop.',
            $dish !== '' ? 'The dish: ' . $dish : 'A review of the shop.',
            self::obj(['shows' => 'string', 'concern' => 'boolean']),
            $picture,
            timeout: 60,
        );
        $shows = mb_substr(trim((string) ($out['shows'] ?? '')), 0, 200);

        return $shows === '' ? '' : (!empty($out['concern']) ? 'Check before showing: ' : '') . $shows;
    }

    /** The words the picture service is given for a dish with no photo. */
    public static function photoPrompt(string $dish, string $about = ''): string
    {
        return 'A realistic, appetising photograph of one serving of ' . $dish . ($about !== '' ? ' (' . mb_substr($about, 0, 240) . ')' : '')
            . ', as a small café in the Maldives would serve it, on a plain plate or in a plain bowl. Shot from a three-quarter angle above, in soft daylight, on a plain light surface, the whole dish in the frame with a little room round it. Landscape, 4:3. Nothing else in the picture: no people, no hands, no text, no logos, no cutlery brands, no garnish the dish would not have.';
    }

    /**
     * A schema for a list of flat rows.
     *
     * @param array<string, string> $fields
     * @return array<string, mixed>
     */
    private static function rows(array $fields): array
    {
        return ['type' => 'object', 'additionalProperties' => false, 'required' => ['rows'], 'properties' => ['rows' => ['type' => 'array', 'items' => self::obj($fields)]]];
    }

    /**
     * A flat object schema, every field required.
     *
     * @param array<string, string> $fields name => JSON type
     * @return array<string, mixed>
     */
    private static function obj(array $fields): array
    {
        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => array_keys($fields),
            'properties' => array_map(fn (string $t) => ['type' => $t], $fields),
        ];
    }
}
