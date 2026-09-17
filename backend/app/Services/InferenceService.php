<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

class InferenceService
{
    private const CLASSES = ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'];

    public function predict(UploadedFile $image): array
    {
        $url = config('banana.comparison_url');
        if (! $url) {
            return $this->unavailable();
        }

        try {
            $response = Http::acceptJson()
                ->timeout((int) config('banana.comparison_timeout_seconds', 60))
                ->attach('image', $image->get(), $image->getClientOriginalName())
                ->post($url);
        } catch (ConnectionException) {
            return $this->unavailable();
        }

        if (! $response->successful()) {
            return $this->unavailable();
        }

        $enhanced = $response->json('enhanced', []);
        $probabilities = $enhanced['probabilities'] ?? [];
        if (! is_array($probabilities) || count($probabilities) !== count(self::CLASSES)) {
            return $this->unavailable();
        }

        $missing = array_diff_key(array_flip(self::CLASSES), $probabilities);
        if ($missing) {
            return $this->unavailable();
        }

        $confidence = (float) ($enhanced['confidence'] ?? 0.0);
        $threshold = (float) config('banana.confidence_threshold', 70);

        return [
            'diseaseId' => $enhanced['predicted_class'] ?? 'development-unconfigured',
            'confidence' => $confidence * 100,
            'latency' => (int) ($enhanced['inference_time_ms'] ?? 0),
            'model' => 'CA-MobileNetV3-Small (FP32 TFLite)',
            'probabilities' => $probabilities,
            'is_simulated' => false,
            'is_uncertain' => $confidence * 100 < $threshold,
            'content_status' => 'READY FOR SOURCE-VALIDATED RESEARCH',
        ];
    }

    private function unavailable(): array
    {
        return [
            'diseaseId' => 'development-unconfigured',
            'confidence' => 0,
            'latency' => 0,
            'model' => 'SIMULATED / DEVELOPMENT — trained model pending',
            'probabilities' => [],
            'is_simulated' => true,
            'is_uncertain' => true,
            'content_status' => 'DISEASE CONTENT PENDING — a validated trained-model label map is not yet available.',
        ];
    }
}
