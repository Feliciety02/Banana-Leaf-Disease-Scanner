<?php

namespace App\Http\Controllers;

use App\Models\Diagnosis;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DiagnosisMediaController extends Controller
{
    public function __invoke(Diagnosis $diagnosis, string $kind): BinaryFileResponse
    {
        $this->authorize('view', $diagnosis);
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
