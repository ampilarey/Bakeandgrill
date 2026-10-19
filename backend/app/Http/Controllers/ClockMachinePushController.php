<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Shifts\ClockMachine\ClockMachine;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * ZKTeco's ADMS push (`/iclock/...`), the address a fingerprint or palm clock sends to.
 * The clock cannot do HTTPS or sign in, so it is known by its serial number alone and
 * must be allowed in Admin → Time Clock → Clock machine before anything it sends counts.
 * Registered without the web group (no session, no CSRF): bootstrap/app.php.
 */
class ClockMachinePushController extends Controller
{
    /** GET: the clock says hello and asks what to send. POST: it sends punches or its records. */
    public function cdata(Request $request): Response
    {
        $device = ClockMachine::deviceFor((string) $request->query('SN', ''), $request->ip());
        if ($device === null || !$device->isAllowed()) {
            // Refused, so the clock keeps its punches and tries again later.
            return $this->text('Not allowed', 403);
        }

        if ($request->isMethod('get')) {
            return $this->text(ClockMachine::options($device));
        }

        $table = strtoupper((string) $request->query('table', ''));
        $body = (string) $request->getContent();
        if ($table === 'ATTLOG') {
            $n = ClockMachine::receivePunches($device, $body, $request->query('Stamp'));

            return $this->text('OK: ' . $n);
        }
        if ($table === 'OPERLOG') {
            ClockMachine::receiveOperations($device, $body);
        }

        return $this->text('OK');
    }

    /** The clock asks for commands; there are none, so it keeps its own settings. */
    public function getrequest(Request $request): Response
    {
        $device = ClockMachine::deviceFor((string) $request->query('SN', ''), $request->ip());

        return $device !== null && $device->isAllowed() ? $this->text('OK') : $this->text('Not allowed', 403);
    }

    /** Replies to commands we never send, and any other path the clock's firmware uses. */
    public function other(): Response
    {
        return $this->text('OK');
    }

    private function text(string $body, int $status = 200): Response
    {
        return response($body, $status, ['Content-Type' => 'text/plain; charset=utf-8', 'Cache-Control' => 'no-store']);
    }
}
