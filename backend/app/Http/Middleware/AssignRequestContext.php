<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AssignRequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $providedRequestId = $request->header('X-Request-ID');
        $requestId = is_string($providedRequestId) && preg_match('/^[A-Za-z0-9._:-]{1,100}$/', $providedRequestId)
            ? $providedRequestId
            : (string) Str::uuid();
        $startedAt = hrtime(true);

        Log::withContext(['request_id' => $requestId]);
        $request->attributes->set('request_id', $requestId);

        $response = $next($request);
        $response->headers->set('X-Request-ID', $requestId);

        if ($response->getStatusCode() >= 400) {
            Log::warning('API request failed.', [
                'method' => $request->method(),
                'path' => $request->path(),
                'status' => $response->getStatusCode(),
                'user_id' => $request->user()?->getAuthIdentifier(),
                'duration_ms' => round((hrtime(true) - $startedAt) / 1_000_000, 2),
            ]);
        }

        return $response;
    }
}
