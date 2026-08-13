<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('select 1');

            return response()->json([
                'service' => 'dahonmd-api',
                'status' => 'ok',
                'checks' => ['database' => 'ok'],
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'service' => 'dahonmd-api',
                'status' => 'degraded',
                'checks' => ['database' => 'unavailable'],
            ], 503);
        }
    }
}
