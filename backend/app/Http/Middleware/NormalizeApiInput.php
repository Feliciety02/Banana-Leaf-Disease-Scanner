<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class NormalizeApiInput
{
    public function handle(Request $request, Closure $next): Response
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => Str::lower($request->string('email')->trim()->toString())]);
        }

        return $next($request);
    }
}
