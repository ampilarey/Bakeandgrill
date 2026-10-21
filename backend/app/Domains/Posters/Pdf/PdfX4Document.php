<?php

declare(strict_types=1);

namespace App\Domains\Posters\Pdf;

use App\Domains\Posters\PaperSize;
use TCPDF;
use TCPDF_FONT_DATA;
use TCPDF_STATIC;

/**
 * A TCPDF document that comes out as PDF/X-4 (docs/POSTER_PLAN.md § 12.4).
 *
 * TCPDF has no PDF/X mode: it writes an ICC output intent and the XMP
 * identification only for PDF/A. PDF/X-4 (ISO 15930-7) needs, on top of a
 * plain PDF 1.6 file: an OutputIntents entry with /S /GTS_PDFX (and the
 * press profile embedded as DestOutputProfile), a pdfxid block in the XMP,
 * /GTS_PDFXVersion and /Trapped in the Info dictionary, every font
 * embedded, no encryption, no actions and no annotations inside the bleed.
 * This subclass overrides _putcatalog and _putinfo for the first three,
 * adds the XMP block through setExtraXMPRDF, and turns off the things TCPDF
 * adds by default that would fail the rest (the "Powered by TCPDF" link in
 * a non-embedded core font).
 *
 * It depends on TCPDF internals (_newobj, _out, _getrawstream,
 * _putviewerpreferences, _textstring); PdfX4DocumentTest parses an export
 * for every one of these marks so a TCPDF upgrade cannot quietly undo them.
 *
 * Text: Thaana is passed in visual order from App\Support\ThaanaVisual with
 * the composed face, as the labels do. TCPDF would run its own bidi
 * reordering on any string with a right-to-left character (its "Arabic"
 * test covers the Thaana block too, and a bare letter such as a final RAA
 * stays a Thaana code point after composing) and reorder the fili a second
 * time, so the two patterns it uses to detect such text are replaced with
 * one that never matches.
 */
class PdfX4Document extends TCPDF
{
    public const VERSION_NAME = 'PDF/X-4';

    public const PDF_VERSION = '1.6';

    private const NEVER = '/(?!)/';

    public function __construct(private readonly OutputIntent $intent, string $title = 'Poster')
    {
        parent::__construct('P', 'mm', 'A4', true, 'UTF-8', false, false);

        // Both patterns, because TCPDF's "Arabic" one covers the Thaana block too.
        TCPDF_FONT_DATA::$uni_RE_PATTERN_RTL = self::NEVER;
        TCPDF_FONT_DATA::$uni_RE_PATTERN_ARABIC = self::NEVER;

        $this->tcpdflink = false;
        $this->dropCoreFonts();
        $this->setPDFVersion(self::PDF_VERSION);
        $this->SetCreator('Bake & Grill');
        $this->SetAuthor('Bake & Grill');
        $this->SetTitle($title);
        $this->setPrintHeader(false);
        $this->setPrintFooter(false);
        $this->SetAutoPageBreak(false, 0);
        $this->SetMargins(0, 0, 0, true);
        $this->setCellPaddings(0, 0, 0, 0);
        $this->setFontSubsetting(true);
        $this->setExtraXMPRDF(
            "\t\t" . '<rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">' . "\n"
            . "\t\t\t" . '<pdfxid:GTS_PDFXVersion>' . self::VERSION_NAME . '</pdfxid:GTS_PDFXVersion>' . "\n"
            . "\t\t" . '</rdf:Description>' . "\n",
        );
    }

    public function intent(): OutputIntent
    {
        return $this->intent;
    }

    /**
     * A page the size of the trim plus its bleed, with the MediaBox and
     * BleedBox at the outer edge and the TrimBox at the cut (§ 6.1).
     */
    public function addPosterPage(PaperSize $size): void
    {
        $w = $size->bleedWidth();
        $h = $size->bleedHeight();
        $b = $size->bleed;
        $this->AddPage('', [
            'MediaBox' => ['llx' => 0, 'lly' => 0, 'urx' => $w, 'ury' => $h],
            'BleedBox' => ['llx' => 0, 'lly' => 0, 'urx' => $w, 'ury' => $h],
            'TrimBox' => ['llx' => $b, 'lly' => $b, 'urx' => $w - $b, 'ury' => $h - $b],
        ]);
        // AddPage re-selects the default core font; see dropCoreFonts().
        $this->dropCoreFonts();
    }

    /**
     * Fill a closed path given in page millimetres (nonzero winding, as SVG
     * fills by default), in a CMYK colour.
     *
     * @param list<array{0: string, 1: list<float>}> $ops 'M' x y, 'L' x y, 'C' x1 y1 x2 y2 x3 y3, 'Z'
     * @param array{0: float, 1: float, 2: float, 3: float} $cmyk percentages
     */
    public function fillPath(array $ops, array $cmyk): void
    {
        $this->SetFillColorArray($cmyk);
        $this->fillPathCurrent($ops);
    }

    /**
     * The same path fill, keeping the colour already set (a spot layer).
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     */
    public function fillPathCurrent(array $ops): void
    {
        $s = $this->pathString($ops);
        if ($s !== '') {
            $this->_out($s . 'f');
        }
    }

    /**
     * The content-stream path for ops in page millimetres: y measured from
     * the top, as every piece is, turned into PDF points from the bottom.
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     */
    public function pathString(array $ops): string
    {
        $k = $this->k;
        $h = $this->h;
        $s = '';
        foreach ($ops as [$op, $p]) {
            switch ($op) {
                case 'M':
                    $s .= sprintf('%.4F %.4F m ', $p[0] * $k, ($h - $p[1]) * $k);
                    break;
                case 'L':
                    $s .= sprintf('%.4F %.4F l ', $p[0] * $k, ($h - $p[1]) * $k);
                    break;
                case 'C':
                    $s .= sprintf(
                        '%.4F %.4F %.4F %.4F %.4F %.4F c ',
                        $p[0] * $k,
                        ($h - $p[1]) * $k,
                        $p[2] * $k,
                        ($h - $p[3]) * $k,
                        $p[4] * $k,
                        ($h - $p[5]) * $k,
                    );
                    break;
                case 'Z':
                    $s .= 'h ';
                    break;
            }
        }

        return $s;
    }

    /**
     * Fill and/or stroke a path, the way a poster template's artwork asks
     * (docs/POSTER_THEMES_HANDOFF.md § 3): nonzero or even-odd fill, and a
     * stroke with its width, dash and cap. Widths are page millimetres.
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     * @param array{0: float, 1: float, 2: float, 3: float}|null $fill CMYK percentages; null for no fill
     * @param array{cmyk: array{0: float, 1: float, 2: float, 3: float}, width: float, dash?: list<float>|null, cap?: string}|null $stroke
     */
    public function paintPath(array $ops, ?array $fill, string $rule = 'nonzero', ?array $stroke = null): void
    {
        $path = $this->pathString($ops);
        if ($path === '') {
            return;
        }
        $evenOdd = $rule === 'evenodd';
        $out = '';
        if ($fill !== null) {
            $this->SetFillColorArray($fill);
        }
        if ($stroke !== null) {
            $k = $this->k;
            $this->SetDrawColorArray($stroke['cmyk']);
            $out .= sprintf('%.4F w ', max(0.0, (float) $stroke['width']) * $k);
            $dash = $stroke['dash'] ?? null;
            if (is_array($dash) && $dash !== []) {
                $out .= '[' . implode(' ', array_map(static fn ($d): string => sprintf('%.4F', max(0.01, (float) $d) * $k), $dash)) . '] 0 d ';
            } else {
                $out .= '[] 0 d ';
            }
            $out .= match ((string) ($stroke['cap'] ?? 'butt')) {
                'round' => '1 J 1 j ',
                'square' => '2 J 0 j ',
                default => '0 J 0 j ',
            };
        }
        $op = match (true) {
            $fill !== null && $stroke !== null => $evenOdd ? 'B*' : 'B',
            $fill !== null => $evenOdd ? 'f*' : 'f',
            $stroke !== null => 'S',
            default => 'n',
        };
        $this->_out($out . $path . $op);
        if ($stroke !== null) {
            // Back to TCPDF's own line state for whatever it draws next.
            $this->_out('[] 0 d 0 J 0 j ' . sprintf('%.4F w', $this->LineWidth * $this->k));
        }
    }

    /**
     * Fill a path with a linear or radial gradient: the path clips, the unit
     * square is laid over $bbox (y up, as TCPDF's own gradients have it, so
     * the SVG's y-down stops are flipped), and TCPDF paints the shading.
     * Gradient() ends with the restore that matches the save made here.
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     * @param array{0: float, 1: float, 2: float, 3: float} $bbox page mm
     * @param array{type: string, coords: list<float>, stops: list<array{0: float, 1: array{0: float, 1: float, 2: float, 3: float}}>} $gradient coords in the box's unit square, y down
     */
    public function fillPathGradient(array $ops, string $rule, array $bbox, array $gradient): void
    {
        $path = $this->pathString($ops);
        [$x, $y, $w, $h] = $bbox;
        if ($path === '' || $w <= 0 || $h <= 0) {
            return;
        }
        $k = $this->k;
        $this->_outSaveGraphicsState();
        $this->_out($path . ($rule === 'evenodd' ? 'W* n' : 'W n'));
        $this->_out(sprintf('%.4F 0 0 %.4F %.4F %.4F cm', $w * $k, $h * $k, $x * $k, ($this->h - ($y + $h)) * $k));
        $stops = [];
        foreach ($gradient['stops'] as [$offset, $cmyk]) {
            $stops[] = ['color' => $cmyk, 'offset' => max(0.0, min(1.0, (float) $offset)), 'exponent' => 1, 'opacity' => 1];
        }
        if ($stops === []) {
            $this->_outRestoreGraphicsState();

            return;
        }
        $c = array_map('floatval', $gradient['coords']);
        if (($gradient['type'] ?? 'linear') === 'radial') {
            $this->Gradient(3, [$c[0], 1 - $c[1], $c[0], 1 - $c[1], $c[2]], $stops);
        } else {
            $this->Gradient(2, [$c[0], 1 - $c[1], $c[2], 1 - $c[3]], $stops);
        }
    }

    /**
     * Clip what follows to a path (until restore()).
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     */
    public function clipToPath(array $ops, string $rule = 'nonzero'): void
    {
        $path = $this->pathString($ops);
        if ($path !== '') {
            $this->_out($path . ($rule === 'evenodd' ? 'W* n' : 'W n'));
        }
    }

    /** Clip what follows to a rectangle in page millimetres (until restore()). */
    public function clipToRect(float $x, float $y, float $w, float $h): void
    {
        $k = $this->k;
        $this->_out(sprintf('%.4F %.4F %.4F %.4F re W n', $x * $k, ($this->h - $y) * $k, $w * $k, -$h * $k));
    }

    public function save(): void
    {
        $this->_outSaveGraphicsState();
    }

    public function restore(): void
    {
        $this->_outRestoreGraphicsState();
    }

    /**
     * Draw with a constant alpha, then put the opaque state back. PDF/X-4
     * allows transparency; the ExtGState lives inside a save/restore so
     * nothing after it inherits the alpha.
     *
     * @param callable(): void $draw
     */
    public function withAlpha(float $alpha, callable $draw): void
    {
        if ($alpha >= 0.999) {
            $draw();

            return;
        }
        $this->save();
        $this->setAlpha($alpha, 'Normal', $alpha);
        $draw();
        $this->restore();
        $this->alpha = ['CA' => 1, 'ca' => 1, 'BM' => '/Normal', 'AIS' => false];
    }

    /**
     * A template's artwork, already mapped to page millimetres and press
     * ink by PosterThemePieces, in order. A `{photo_slot: pN}` item hands
     * over to $drawPhotoSlot, so frames and shadows around a photo land
     * before and after it as the design has them.
     *
     * @param list<array<string, mixed>> $items
     * @param callable(string): void $drawPhotoSlot
     */
    public function drawBackdrop(array $items, callable $drawPhotoSlot): void
    {
        foreach ($items as $item) {
            if (isset($item['photo_slot'])) {
                $drawPhotoSlot((string) $item['photo_slot']);

                continue;
            }
            $this->withAlpha((float) ($item['opacity'] ?? 1.0), function () use ($item): void {
                $clip = $item['clip_rect'] ?? null;
                if (is_array($clip)) {
                    $this->save();
                    $this->clipToRect((float) $clip[0], (float) $clip[1], (float) $clip[2], (float) $clip[3]);
                }
                $rule = (string) ($item['rule'] ?? 'nonzero');
                if (is_array($item['gradient'] ?? null)) {
                    $this->fillPathGradient($item['ops'], $rule, $item['bbox'], $item['gradient']);
                    if (is_array($item['stroke'] ?? null)) {
                        $this->paintPath($item['ops'], null, $rule, $item['stroke']);
                    }
                } else {
                    $this->paintPath($item['ops'], $item['fill'] ?? null, $rule, $item['stroke'] ?? null);
                }
                if (is_array($clip)) {
                    $this->restore();
                }
            });
        }
    }

    /**
     * A circle as four cubic curves, in page millimetres, for fillPath().
     *
     * @return list<array{0: string, 1: list<float>}>
     */
    public static function circleOps(float $cx, float $cy, float $r): array
    {
        $k = 0.5522847498 * $r;

        return [
            ['M', [$cx + $r, $cy]],
            ['C', [$cx + $r, $cy + $k, $cx + $k, $cy + $r, $cx, $cy + $r]],
            ['C', [$cx - $k, $cy + $r, $cx - $r, $cy + $k, $cx - $r, $cy]],
            ['C', [$cx - $r, $cy - $k, $cx - $k, $cy - $r, $cx, $cy - $r]],
            ['C', [$cx + $k, $cy - $r, $cx + $r, $cy - $k, $cx + $r, $cy]],
            ['Z', []],
        ];
    }

    /**
     * TCPDF's constructor selects Helvetica, a core font that is never
     * embedded, and would list it in every page's resources even when no
     * text uses it: a PDF/X "font not embedded" failure. Every poster face
     * is set through PosterFonts before any text, so the core entry goes.
     */
    private function dropCoreFonts(): void
    {
        foreach (array_keys($this->fonts) as $key) {
            if (($this->fonts[$key]['type'] ?? '') === 'core') {
                unset($this->fonts[$key]);
            }
        }
        $kept = array_keys($this->fonts);
        $this->fontkeys = array_values(array_filter($this->fontkeys, static fn ($k) => in_array($k, $kept, true)));
        $this->fontlist = array_values(array_filter($this->fontlist, static fn ($k) => in_array($k, $kept, true)));
        $this->numfonts = count($this->fontkeys);
        if (($this->CurrentFont['type'] ?? '') === 'core') {
            // setGraphicVars() re-adds whatever family this names, and setFont()
            // saves the previous font's subset back into the buffer: neither
            // may see the core font.
            $this->FontFamily = '';
            $this->CurrentFont = [];
        }
    }

    /** The finished file. */
    public function bytes(): string
    {
        if ($this->CurrentFont === []) {
            // A page with no text (a mask) never selected a font; TCPDF's
            // page-alias pass at Close() still reads one. Subsetting keeps
            // the unused face out of the file.
            PosterFonts::use($this, 'j5', 8);
        }

        return (string) $this->Output('poster.pdf', 'S');
    }

    /**
     * The Info dictionary, as TCPDF writes it, plus the two keys PDF/X asks
     * for: the version name, and Trapped (TCPDF already writes False).
     */
    protected function _putinfo()
    {
        $oid = $this->_newobj();
        $out = '<<';
        $prev = $this->isunicode;
        if ($this->docinfounicode) {
            $this->isunicode = true;
        }
        if (!TCPDF_STATIC::empty_string($this->title)) {
            $out .= ' /Title ' . $this->_textstring($this->title, $oid);
        }
        if (!TCPDF_STATIC::empty_string($this->author)) {
            $out .= ' /Author ' . $this->_textstring($this->author, $oid);
        }
        if (!TCPDF_STATIC::empty_string($this->subject)) {
            $out .= ' /Subject ' . $this->_textstring($this->subject, $oid);
        }
        if (!TCPDF_STATIC::empty_string($this->keywords)) {
            $out .= ' /Keywords ' . $this->_textstring($this->keywords, $oid);
        }
        if (!TCPDF_STATIC::empty_string($this->creator)) {
            $out .= ' /Creator ' . $this->_textstring($this->creator, $oid);
        }
        $this->isunicode = $prev;
        $out .= ' /Producer ' . $this->_textstring(TCPDF_STATIC::getTCPDFProducer(), $oid);
        $out .= ' /CreationDate ' . $this->_datestring(0, $this->doc_creation_timestamp);
        $out .= ' /ModDate ' . $this->_datestring(0, $this->doc_modification_timestamp);
        $out .= ' /Trapped /False';
        // A plain literal, not TCPDF's UTF-16 text string: every preflight reads it.
        $out .= ' /GTS_PDFXVersion (' . self::VERSION_NAME . ')';
        $out .= ' >>';
        $out .= "\n" . 'endobj';
        $this->_out($out);

        return $oid;
    }

    /**
     * The catalog: TCPDF's, cut to what a poster uses (no JavaScript, forms,
     * layers, outlines or embedded files), with the PDF/X output intent and
     * the press profile when it is on disk.
     */
    protected function _putcatalog()
    {
        $xmpobj = $this->_putXMP();

        $iccobj = null;
        $icc = $this->intent->profileBytes();
        if ($icc !== null) {
            $iccobj = $this->_newobj();
            $filter = '';
            if ($this->compress) {
                $filter = ' /Filter /FlateDecode';
                $icc = gzcompress($icc);
            }
            $icc = $this->_getrawstream($icc);
            $this->_out('<</N ' . $this->intent->components . $filter . ' /Length ' . strlen($icc) . '>> stream' . "\n" . $icc . "\n" . 'endstream' . "\n" . 'endobj');
        }

        $oid = $this->_newobj();
        $out = '<< /Type /Catalog';
        $out .= ' /Version /' . $this->PDFVersion;
        $out .= ' /Pages 1 0 R';
        $out .= $this->_putviewerpreferences();
        $out .= ' /Metadata ' . $xmpobj . ' 0 R';
        if (isset($this->l['a_meta_language'])) {
            $out .= ' /Lang ' . $this->_textstring($this->l['a_meta_language'], $oid);
        }
        $out .= ' /OutputIntents [<<';
        $out .= ' /Type /OutputIntent';
        $out .= ' /S /GTS_PDFX';
        $out .= ' /OutputCondition ' . $this->_textstring($this->intent->condition, $oid);
        $out .= ' /OutputConditionIdentifier ' . $this->_textstring($this->intent->identifier, $oid);
        $out .= ' /RegistryName ' . $this->_textstring($this->intent->registry, $oid);
        $out .= ' /Info ' . $this->_textstring($this->intent->info, $oid);
        if ($iccobj !== null) {
            $out .= ' /DestOutputProfile ' . $iccobj . ' 0 R';
        }
        $out .= ' >>]';
        $out .= ' >>';
        $out .= "\n" . 'endobj';
        $this->_out($out);

        return $oid;
    }
}
