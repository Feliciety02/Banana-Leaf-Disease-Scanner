<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;

class InferenceService
{
    public function predict(UploadedFile $image): array
    {
        // Replace this response with the Python inference-service HTTP call.
        return [
            'diseaseId' => 'development-unconfigured',
            'confidence' => 0,
            'latency' => 0,
            'model' => 'SIMULATED / DEVELOPMENT â€” trained model pending',
            'probabilities' => [],
            'is_simulated' => true,
            'is_uncertain' => true,
            'content_status' => 'DISEASE CONTENT PENDING â€” a validated trained-model label map is not yet available.',
        ];
    }
}
