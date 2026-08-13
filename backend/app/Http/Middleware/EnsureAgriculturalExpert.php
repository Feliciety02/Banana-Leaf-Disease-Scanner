<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAgriculturalExpert
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isAgriculturalExpert()) {
            return response()->json(['success' => false, 'message' => 'Agricultural reviewer access is required.', 'errors' => (object) []], 403);
        }

        return $next($request);
    }
}
