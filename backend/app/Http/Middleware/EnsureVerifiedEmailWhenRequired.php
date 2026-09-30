<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Guards actions that share data with other people (review requests, image
 * uploads, research consent, staff workspaces). Offline scanning and history
 * sync stay available to unverified farmers.
 */
class EnsureVerifiedEmailWhenRequired
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (config('banana.require_verified_email') && $user instanceof MustVerifyEmail && ! $user->hasVerifiedEmail()) {
            return response()->json([
                'success' => false,
                'message' => 'Verify your email address before using this feature. Use "Resend verification email" in your profile if you need a new link.',
                'errors' => ['email' => ['Your email address is not verified.']],
            ], 403);
        }

        return $next($request);
    }
}
