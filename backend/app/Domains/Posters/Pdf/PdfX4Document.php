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
        if ($s !== '') {
            $this->_out($s . 'f');
        }
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
