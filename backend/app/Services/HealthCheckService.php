<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Throwable;

class HealthCheckService
{
    public function check(): array
    {
        try {
            DB::select('select 1');

            return ['status' => 200, 'body' => [
                'service' => 'dahonmd-api',
                'status' => 'ok',
                'checks' => ['database' => 'ok'],
            ]];
        } catch (Throwable $exception) {
            report($exception);

            return ['status' => 503, 'body' => [
                'service' => 'dahonmd-api',
                'status' => 'degraded',
                'checks' => ['database' => 'unavailable'],
            ]];
        }
    }
}
