<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ResearchImage;
use App\Services\ResearchImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ResearchImageController extends Controller
{
    public function __construct(private readonly ResearchImageService $images) {}

    public function index(): JsonResponse
    {
        $items = ResearchImage::query()->with('approver:id,name', 'revoker:id,name')
            ->latest('approved_at')->limit(200)->get()->map(fn (ResearchImage $image) => $this->item($image));
        return response()->json(['success' => true, 'message' => 'Research image audit retrieved.', 'data' => $items]);
    }

    public function photo(ResearchImage $researchImage): BinaryFileResponse
    {
        abort_if($researchImage->revoked_at || ! $researchImage->image_path, 404);
        abort_unless(Storage::disk('local')->exists($researchImage->image_path), 404);
        return response()->file(Storage::disk('local')->path($researchImage->image_path), [
            'Cache-Control' => 'private, no-store',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
        ]);
    }

    public function destroy(Request $request, ResearchImage $researchImage): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $image = $this->images->revoke($researchImage, $request->user(), trim($data['reason']));
        return response()->json(['success' => true, 'message' => $image->image_path ? 'Research use revoked; private photo removal is pending retry.' : 'Research copy revoked and its private photo removed.', 'data' => $this->item($image)]);
    }

    private function item(ResearchImage $image): array
    {
        return [
            'id' => $image->id,
            'source_diagnosis_id' => $image->source_diagnosis_id,
            'source_candidate_id' => $image->source_candidate_id,
            'verified_label' => $image->verified_label,
            'sha256' => $image->sha256,
            'consent_version' => $image->consent_version,
            'consented_at' => $image->consented_at,
            'approved_at' => $image->approved_at,
            'approved_by' => $image->approver?->name,
            'revoked_at' => $image->revoked_at,
            'revoked_by' => $image->revoker?->name,
            'revocation_reason' => $image->revocation_reason,
            'photo_available' => ! $image->revoked_at && (bool) $image->image_path,
            'file_removal_pending' => (bool) $image->revoked_at && (bool) $image->image_path,
        ];
    }
}
