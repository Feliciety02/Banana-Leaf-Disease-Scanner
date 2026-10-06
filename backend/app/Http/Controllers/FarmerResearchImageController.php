<?php

namespace App\Http\Controllers;

use App\Models\ResearchImage;
use App\Services\ResearchImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FarmerResearchImageController extends Controller
{
    public function __construct(private readonly ResearchImageService $images) {}

    public function index(Request $request): JsonResponse
    {
        $items = ResearchImage::query()->where('source_user_id', $request->user()->id)
            ->latest('approved_at')->limit(100)->get()->map(fn (ResearchImage $image) => $this->item($image));
        return response()->json(['success' => true, 'message' => 'Your approved research photos retrieved.', 'data' => $items]);
    }

    public function destroy(Request $request, ResearchImage $researchImage): JsonResponse
    {
        abort_unless($researchImage->source_user_id === $request->user()->id, 403);
        $image = $this->images->revoke($researchImage, $request->user(), 'Farmer withdrew research consent');
        return response()->json(['success' => true, 'message' => $image->image_path ? 'Research use revoked; private photo removal is pending retry.' : 'Research copy revoked and private photo removed.', 'data' => $this->item($image)]);
    }

    private function item(ResearchImage $image): array
    {
        return [
            'id' => $image->id, 'source_diagnosis_id' => $image->source_diagnosis_id,
            'verified_label' => $image->verified_label, 'approved_at' => $image->approved_at,
            'revoked_at' => $image->revoked_at,
            'file_removal_pending' => (bool) $image->revoked_at && (bool) $image->image_path,
        ];
    }
}
