<?php

namespace App\Services;

use App\Support\ClassLabelRegistry;

class SystemInformationService
{
    public function __construct(private readonly ClassLabelRegistry $registry) {}

    public function information(): array
    {
        return [
            'model' => 'CA-MobileNetV3-Small',
            'attention' => 'Coordinate Attention',
            'deployment' => 'TensorFlow Lite FP32',
            'version' => config('banana.model_version'),
            'input_size' => config('banana.input_size'),
            'classes' => $this->registry->labels(),
            'final_model_classes_known' => $this->registry->isEstablished(),
            'research_comparison_configured' => filled(config('banana.comparison_url')),
            'disease_content_status' => $this->registry->isEstablished() ? 'READY FOR SOURCE-VALIDATED RESEARCH' : 'DISEASE CONTENT PENDING â€” a validated trained-model label map is not yet available.',
            'confidence_threshold' => (float) config('banana.confidence_threshold'),
            'ai_mode' => config('banana.ai_mode'),
        ];
    }
}
