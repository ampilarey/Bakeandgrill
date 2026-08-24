<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Domains\Media\Services\MediaLibraryService;
use App\Models\User;
use App\Services\MenuImageProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * An upload must never be stored as something the web server will execute.
 *
 * `storage:link` exposes `storage/app/public` at `/storage`, inside the
 * docroot, and this host runs PHP there — confirmed on the live server by
 * writing a probe file and fetching it back.
 *
 * The MIME sniff alone was not enough. `finfo` calls anything beginning
 * `%PDF-` a PDF, and a PDF carries arbitrary trailing bytes happily — so a
 * file whose contents start `%PDF-1.4` and continue `<?php … ?>` passed the
 * content gate, and the stored extension was taken from the *uploader's*
 * filename. Named `invoice.php`, it became a shell on the public disk,
 * reachable by anyone holding `media.manage` — a manager, not just the owner.
 */
class UploadExtensionHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    /** A real PDF by content — with PHP hidden after the header. */
    private function pdfPhpPolyglot(string $filename): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'polyglot');
        file_put_contents(
            $path,
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
            . "<?php echo 'PWNED'; ?>\n"
            . "trailer\n<< /Root 1 0 R >>\n%%EOF\n",
        );

        return new UploadedFile($path, $filename, 'application/pdf', null, true);
    }

    public function test_a_pdf_named_php_is_not_stored_as_php(): void
    {
        // THE test. The upload is a genuine PDF as far as content sniffing is
        // concerned, so it is accepted — but it must land as .pdf.
        $file = $this->pdfPhpPolyglot('invoice.php');

        $result = app(MediaLibraryService::class)->storeUpload($file, User::factory()->create());

        $path = $result['asset']->path;
        $this->assertStringEndsWith('.pdf', $path);
        $this->assertStringNotContainsString('.php', $path);
    }

    public function test_an_uppercase_or_padded_php_extension_is_not_a_way_round_it(): void
    {
        foreach (['invoice.PHP', 'invoice.pHp5', 'invoice.phtml'] as $name) {
            $result = app(MediaLibraryService::class)
                ->storeUpload($this->pdfPhpPolyglot($name), User::factory()->create());

            $this->assertStringEndsWith(
                '.pdf',
                $result['asset']->path,
                "{$name} must still be stored as a pdf",
            );
        }
    }

    public function test_store_raw_refuses_an_executable_extension_outright(): void
    {
        // The chokepoint, tested directly: every path that names a file on the
        // public disk goes through here, so a future caller that trusts its
        // input still cannot write a program.
        $file = $this->pdfPhpPolyglot('anything.pdf');

        $this->expectException(\RuntimeException::class);
        app(MenuImageProcessor::class)->storeRaw($file, 'library/documents', 'php');
    }

    public function test_store_raw_still_writes_the_types_the_app_actually_uses(): void
    {
        // The guard must not break real uploads — if this fails, the media
        // library stops working.
        $processor = app(MenuImageProcessor::class);

        foreach (['pdf', 'mp3', 'mp4', 'jpg', 'woff2'] as $ext) {
            $path = $processor->storeRaw($this->pdfPhpPolyglot('file.' . $ext), 'library/documents', $ext);
            $this->assertStringEndsWith('.' . $ext, $path);
        }
    }

    public function test_a_genuine_pdf_is_still_accepted_and_stored(): void
    {
        $result = app(MediaLibraryService::class)
            ->storeUpload($this->pdfPhpPolyglot('menu.pdf'), User::factory()->create());

        $this->assertSame('document', $result['asset']->media_type);
        $this->assertStringEndsWith('.pdf', $result['asset']->path);
        Storage::disk('public')->assertExists($result['asset']->path);
    }

    public function test_a_plain_script_is_rejected_on_content_before_extension_matters(): void
    {
        // The existing MIME gate, pinned so it cannot be loosened without a
        // failing test: a file that is not one of the allowed media types
        // never reaches storage at all.
        $path = tempnam(sys_get_temp_dir(), 'script');
        file_put_contents($path, "<?php echo 'PWNED';");
        $file = new UploadedFile($path, 'shell.pdf', 'application/pdf', null, true);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(MediaLibraryService::class)->storeUpload($file, User::factory()->create());
    }
}
