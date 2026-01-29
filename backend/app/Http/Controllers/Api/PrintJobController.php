<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PrintJob;
use App\Services\PrintProxyService;
use Illuminate\Http\Request;

class PrintJobController extends Controller
{
    public function index(Request $request)
    {
        $status = $request->query('status');

        $query = PrintJob::with('printer')->orderByDesc('created_at');
        if ($status) {
            $query->where('status', $status);
        }

        return response()->json(['jobs' => $query->paginate(50)]);
    }

    public function retry(PrintProxyService $printProxy, $id)
    {
        $job = PrintJob::findOrFail($id);
        $job->update([
            'status' => 'queued',
        ]);

        try {
            $printProxy->send($job);
        } catch (\Throwable $error) {
            $job->update([
                'status' => 'failed',
                'attempts' => $job->attempts + 1,
                'last_error' => $error->getMessage(),
            ]);
        }

        return response()->json(['job' => $job->fresh()]);
    }
}
