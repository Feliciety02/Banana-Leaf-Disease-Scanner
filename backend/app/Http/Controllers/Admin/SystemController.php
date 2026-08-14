<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\ClassLabelRegistry;
use Illuminate\Http\JsonResponse;

class SystemController extends Controller
{
    public function show(ClassLabelRegistry $registry): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'System information retrieved.', 'data' => [
            'model' => 'CA-MobileNetV3-Small',
            'attention' => 'Coordinate Attention',
            'deployment' => 'TensorFlow Lite FP32',
            'version' => config('banana.model_version'),
            'input_size' => config('banana.input_size'),
            'classes' => $registry->labels(),
            'final_model_classes_known' => $registry->isEstablished(),
            'research_comparison_configured' => filled(config('banana.comparison_url')),
            'disease_content_status' => $registry->isEstablished() ? 'READY FOR SOURCE-VALIDATED RESEARCH' : 'DISEASE CONTENT PENDING — a validated trained-model label map is not yet available.',
            'confidence_threshold' => (float) config('banana.confidence_threshold'),
            'ai_mode' => config('banana.ai_mode'),
        ]]);
    }
}
