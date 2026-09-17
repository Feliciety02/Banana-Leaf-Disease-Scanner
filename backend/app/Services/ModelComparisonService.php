<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;

class ModelComparisonService
{
    private const CLASSES = ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'];

    public function compare(UploadedFile $image): array
    {
        $url = config('banana.comparison_url');
        if (! $url) {
            return $this->error('Research comparison is not configured. Train and validate both TFLite artifacts, then configure AI_COMPARISON_URL.', 503);
        }

        try {
            $response = Http::acceptJson()
                ->timeout((int) config('banana.comparison_timeout_seconds', 60))
                ->attach('image', $image->get(), $image->getClientOriginalName())
                ->post($url);
        } catch (ConnectionException) {
            return $this->error('The research inference service is unavailable.', 503);
        }

        if (! $response->successful()) {
            return $this->error('The research inference service could not complete the comparison.', 502);
        }

        $payload = $response->json();
        $validator = Validator::make($payload ?? [], [
            'timestamp' => ['required', 'string'],
            'baseline.model' => ['required', 'in:baseline'],
            'baseline.predicted_class' => ['required', 'in:'.implode(',', self::CLASSES)],
            'baseline.confidence' => ['required', 'numeric', 'between:0,1'],
            'baseline.probabilities' => ['required', 'array:'.implode(',', self::CLASSES)],
            'baseline.probabilities.healthy' => ['required', 'numeric', 'between:0,1'],
            'baseline.probabilities.sigatoka' => ['required', 'numeric', 'between:0,1'],
            'baseline.probabilities.panama-disease' => ['required', 'numeric', 'between:0,1'],
            'baseline.probabilities.cordana-leaf-spot' => ['required', 'numeric', 'between:0,1'],
            'baseline.inference_time_ms' => ['required', 'numeric', 'min:0'],
            'baseline.model_size_bytes' => ['required', 'integer', 'min:1'],
            'enhanced.model' => ['required', 'in:enhanced'],
            'enhanced.predicted_class' => ['required', 'in:'.implode(',', self::CLASSES)],
            'enhanced.confidence' => ['required', 'numeric', 'between:0,1'],
            'enhanced.probabilities' => ['required', 'array:'.implode(',', self::CLASSES)],
            'enhanced.probabilities.healthy' => ['required', 'numeric', 'between:0,1'],
            'enhanced.probabilities.sigatoka' => ['required', 'numeric', 'between:0,1'],
            'enhanced.probabilities.panama-disease' => ['required', 'numeric', 'between:0,1'],
            'enhanced.probabilities.cordana-leaf-spot' => ['required', 'numeric', 'between:0,1'],
            'enhanced.inference_time_ms' => ['required', 'numeric', 'min:0'],
            'enhanced.model_size_bytes' => ['required', 'integer', 'min:1'],
            'comparison.prediction_agreement' => ['required', 'boolean'],
            'comparison.summary' => ['required', 'string'],
            'comparison.enhanced_confidence_difference_percentage_points' => ['required', 'numeric'],
            'comparison.enhanced_latency_difference_ms' => ['required', 'numeric'],
            'comparison.interpretation_note' => ['required', 'string'],
            'study' => ['sometimes', 'array'],
            'study.current_leader' => ['required_with:study', 'in:baseline,enhanced,tie'],
            'study.baseline.accuracy' => ['required_with:study', 'numeric', 'between:0,1'],
            'study.baseline.macro_f1' => ['required_with:study', 'numeric', 'between:0,1'],
            'study.enhanced.accuracy' => ['required_with:study', 'numeric', 'between:0,1'],
            'study.enhanced.macro_f1' => ['required_with:study', 'numeric', 'between:0,1'],
            'study.decision_note' => ['required_with:study', 'string'],
        ]);
        if ($validator->fails()
            || ! $this->hasConsistentDistribution($payload['baseline'])
            || ! $this->hasConsistentDistribution($payload['enhanced'])) {
            return $this->error('The research service returned an invalid comparison contract.', 502);
        }

        return ['status' => 200, 'body' => [
            'success' => true,
            'message' => 'Research comparison completed. This run was not added to diagnosis history.',
            'data' => $payload,
        ]];
    }

    private function hasConsistentDistribution(array $model): bool
    {
        $probabilities = array_map('floatval', $model['probabilities']);
        $maximum = max($probabilities);
        $predictedProbability = $probabilities[$model['predicted_class']];

        return abs(array_sum($probabilities) - 1.0) <= 0.0001
            && abs($predictedProbability - $maximum) <= 0.0001
            && abs((float) $model['confidence'] - $maximum) <= 0.0001;
    }

    private function error(string $message, int $status): array
    {
        return ['status' => $status, 'body' => [
            'success' => false,
            'message' => $message,
            'errors' => (object) [],
        ]];
    }
}
