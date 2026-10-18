<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\System\AdminInbox;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** GET /api/admin/inbox: the "Needs attention" rows this staff member may open (feature 14). */
class AdminInboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);
        $rows = AdminInbox::rowsFor($user);

        return response()->json(['rows' => $rows, 'total' => array_sum(array_column($rows, 'count'))]);
    }
}
