<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class UserAvatarController extends Controller
{
    /**
     * Profile photos are private. Users see their own; administrators and
     * agricultural reviewers see the people they manage or review.
     */
    public function __invoke(Request $request, User $user): BinaryFileResponse
    {
        $viewer = $request->user();
        abort_unless($viewer->is($user) || $viewer->isAdmin() || $viewer->isAgriculturalExpert(), 403);
        abort_unless($user->avatar_path && Storage::disk('local')->exists($user->avatar_path), 404);

        return response()->file(Storage::disk('local')->path($user->avatar_path), [
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }
}
