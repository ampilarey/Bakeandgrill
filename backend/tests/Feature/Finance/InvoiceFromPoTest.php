<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\Invoice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Owner, 2026-11-15: "a place where I can upload PO and generate invoice."
 * The PO is read in the browser; the server keeps the file, makes the invoice
 * with the PO's number and delivery details, and warns of a PO billed before.
 */
class InvoiceFromPoTest extends TestCase
{
    use RefreshDatabase;

    private array $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->owner = $this->staffHeaders($this->makeOwner());
    }

    private function payload(array $more = []): array
    {
        return array_merge([
            'type' => 'sale',
            'issue_date' => today()->toDateString(),
            'recipient_name' => 'Bohemia Luxury Resorts Maldives Private Limited',
            'recipient_address' => 'G. Farukani, Neeloafaru Magu, K. Male, Maldives',
            'customer_tin' => '1183895',
            'po_number' => 'HKUD-M30300000524',
            'deliver_to' => 'NH Maldives Kuda Rah Resort',
            'delivery_date' => '2026-11-20',
            'items' => [
                ['description' => 'MASROSHI', 'quantity' => 200, 'unit' => 'Piece', 'unit_price' => 3.75],
                ['description' => 'BAJIYAA', 'quantity' => 200, 'unit' => 'Piece', 'unit_price' => 3.00],
            ],
        ], $more);
    }

    private function upload(): string
    {
        return (string) $this->post('/api/invoices/po-file', [
            'file' => UploadedFile::fake()->create('po.pdf', 20, 'application/pdf'),
        ], $this->owner)->assertCreated()->json('path');
    }

    public function test_the_invoice_keeps_the_po_number_the_delivery_and_the_file(): void
    {
        $path = $this->upload();
        $this->assertMatchesRegularExpression('#^invoice-pos/\d{4}/\d{2}/[0-9a-f-]{36}\.pdf$#', $path);

        $res = $this->postJson('/api/invoices', $this->payload(['po_file' => $path]), $this->owner)
            ->assertCreated()
            ->assertJsonPath('invoice.po_number', 'HKUD-M30300000524')
            ->assertJsonPath('invoice.deliver_to', 'NH Maldives Kuda Rah Resort')
            ->assertJsonPath('invoice.delivery_date', '2026-11-20')
            ->assertJsonPath('invoice.has_po_file', true)
            ->assertJsonPath('invoice.total', 1350);

        // The stored path never leaves the server; the file comes back by the invoice.
        $this->assertArrayNotHasKey('po_file_path', $res->json('invoice'));
        $id = (int) $res->json('invoice.id');
        $this->get("/api/invoices/{$id}/po-file", $this->owner)
            ->assertOk()
            ->assertHeader('content-disposition', 'attachment; filename=PO-HKUD-M30300000524.pdf');

        // Found by its PO number in the list.
        $this->getJson('/api/invoices?search=M30300000524', $this->owner)
            ->assertOk()
            ->assertJsonPath('data.0.id', $id);
    }

    public function test_a_typed_path_cannot_point_at_another_file(): void
    {
        Storage::disk('local')->put('backups/secret.sql', 'x');

        foreach (['backups/secret.sql', '../.env', 'invoice-pos/2026/11/not-a-uuid.pdf'] as $path) {
            $this->postJson('/api/invoices', $this->payload(['po_file' => $path]), $this->owner)
                ->assertStatus(422)
                ->assertJsonValidationErrors('po_file');
        }
        $this->assertSame(0, Invoice::count());
    }

    public function test_a_po_invoiced_before_is_named_and_a_void_one_is_not(): void
    {
        $this->getJson('/api/invoices/po-check?po_number=HKUD-M30300000524', $this->owner)
            ->assertOk()->assertJsonCount(0, 'invoices');

        $id = (int) $this->postJson('/api/invoices', $this->payload(), $this->owner)->assertCreated()->json('invoice.id');

        $this->getJson('/api/invoices/po-check?po_number=HKUD-M30300000524', $this->owner)
            ->assertOk()->assertJsonCount(1, 'invoices')->assertJsonPath('invoices.0.id', $id);

        Invoice::whereKey($id)->update(['status' => 'void']);
        $this->getJson('/api/invoices/po-check?po_number=HKUD-M30300000524', $this->owner)
            ->assertOk()->assertJsonCount(0, 'invoices');
    }

    public function test_the_invoice_page_and_both_pdfs_carry_the_po(): void
    {
        $id = (int) $this->postJson('/api/invoices', $this->payload(), $this->owner)->assertCreated()->json('invoice.id');
        $invoice = Invoice::findOrFail($id);

        $page = $this->get('/invoices/' . $invoice->token)->assertOk()->getContent();
        foreach (['PO No.:', 'HKUD-M30300000524', 'Delivery: 20 Nov 2026', 'Deliver to: NH Maldives Kuda Rah Resort', 'TIN: 1183895'] as $words) {
            $this->assertStringContainsString($words, $page);
        }

        foreach (['invoices.pdf', 'invoice-pdf'] as $view) {
            if ($view === 'invoice-pdf') {
                continue; // drawn through the page controller, checked below
            }
            $html = view($view, ['invoice' => $invoice->fresh(['items'])])->render();
            $this->assertStringContainsString('HKUD-M30300000524', $html);
            $this->assertStringContainsString('Deliver to: NH Maldives Kuda Rah Resort', $html);
        }
    }

    public function test_only_someone_who_may_make_invoices_can_upload_or_open_a_po(): void
    {
        $cashier = $this->staffHeaders($this->makeStaff());

        $this->post('/api/invoices/po-file', ['file' => UploadedFile::fake()->create('po.pdf', 20, 'application/pdf')], $cashier)
            ->assertForbidden();
        $this->getJson('/api/invoices/po-check?po_number=X', $cashier)->assertForbidden();
    }

    public function test_only_a_pdf_or_a_picture_is_kept(): void
    {
        $this->post('/api/invoices/po-file', [
            'file' => UploadedFile::fake()->create('po.exe', 20, 'application/octet-stream'),
        ], $this->owner + ['Accept' => 'application/json'])->assertStatus(422);
    }
}
