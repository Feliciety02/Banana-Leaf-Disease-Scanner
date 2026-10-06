<?php

namespace App\Http\Controllers;

use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DiagnosisMediaController extends Controller
{
    /**
     * Serves a private scan photo. Browsers cannot attach a bearer token to an
     * <img> request and do not always send the Referer that marks a cookie
     * session, so the photo URLs handed out by DiagnosisResource are signed for
     * the viewer they were issued to. A signed-in request is still checked
     * against its own account, and either way the policy decides.
     */
    public function __invoke(Request $request, Diagnosis $diagnosis, string $kind): BinaryFileResponse
    {
        $viewer = $request->user('sanctum');
        if (! $viewer && $request->hasValidRelativeSignature()) {
            $viewer = User::find($request->query('viewer'));
        }
        if (! $viewer) {
            throw new AuthenticationException;
        }
        Gate::forUser($viewer)->authorize('view', $diagnosis);

        $path = $kind === 'gradcam' ? $diagnosis->gradcam_path : $diagnosis->image_path;
        abort_unless($path, 404);

        $disk = Storage::disk('local')->exists($path) ? 'local' : 'public';
        abort_unless(Storage::disk($disk)->exists($path), 404);

        return response()->file(Storage::disk($disk)->path($path), [
            'Cache-Control' => 'private, no-store',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }
}
