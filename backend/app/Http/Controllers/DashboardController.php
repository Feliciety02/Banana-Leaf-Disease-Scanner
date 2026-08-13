<?php

namespace App\Http\Controllers;

use App\Http\Resources\DiagnosisResource;
use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Models\DiagnosisReview;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $diagnoses = Diagnosis::query()->get(['predicted_class', 'confidence', 'source', 'diagnosed_at']);
        $daily = $diagnoses->groupBy(fn (Diagnosis $diagnosis) => $diagnosis->diagnosed_at->toDateString())
            ->map->count()->sortKeys();
        $totalDiagnoses = Diagnosis::query()->count();
        $uncertainPredictions = Diagnosis::query()->where('confidence', '<', $confidenceThreshold)->count();
        $reviews = DiagnosisReview::query()->with('diagnosis:id,predicted_class,confidence')->where('review_status', '!=', 'pending')->get();
        $determinate = $reviews->whereIn('review_status', ['confirmed', 'alternate_class']);
        $agreements = $determinate->filter(fn ($review) => $review->review_status === 'confirmed' || $review->verified_label === $review->diagnosis?->predicted_class)->count();
        $disagreements = $determinate->filter(fn ($review) => $review->review_status === 'alternate_class' && $review->verified_label !== $review->diagnosis?->predicted_class);
        $agreementByConfidence = collect([
            'high' => $determinate->filter(fn ($review) => $review->diagnosis?->confidence >= 85),
            'medium' => $determinate->filter(fn ($review) => $review->diagnosis?->confidence >= $confidenceThreshold && $review->diagnosis?->confidence < 85),
            'low' => $determinate->filter(fn ($review) => $review->diagnosis?->confidence < $confidenceThreshold),
        ])->map(fn ($group) => [
            'reviewed' => $group->count(),
            'agreement_rate' => $group->count() ? round(($group->filter(fn ($review) => $review->review_status === 'confirmed' || $review->verified_label === $review->diagnosis?->predicted_class)->count() / $group->count()) * 100, 2) : null,
        ]);

        return response()->json(['success' => true, 'message' => 'Dashboard analytics retrieved.', 'data' => [
            'total_farmers' => User::query()->where('role', 'farmer')->count(),
            'total_diagnoses' => $totalDiagnoses,
            'diagnoses_today' => Diagnosis::query()->whereDate('diagnosed_at', today())->count(),
            'average_confidence' => round((float) Diagnosis::query()->avg('confidence'), 2),
            'uncertain_predictions' => $uncertainPredictions,
            'uncertain_prediction_rate' => $totalDiagnoses ? round(($uncertainPredictions / $totalDiagnoses) * 100, 2) : 0,
            'simulated_predictions' => Diagnosis::query()->where('is_simulated', true)->count(),
            'pending_or_failed_syncs' => Diagnosis::query()->whereIn('sync_status', ['pending', 'failed'])->count(),
            'healthy_predictions' => Diagnosis::query()->whereHas('disease', fn ($query) => $query->whereRaw('LOWER(COALESCE(model_class_key, name)) LIKE ?', ['%healthy%']))->count(),
            'diseased_predictions' => Diagnosis::query()->whereHas('disease', fn ($query) => $query->whereRaw('LOWER(COALESCE(model_class_key, name)) NOT LIKE ?', ['%healthy%']))->count(),
            'confidence_threshold' => $confidenceThreshold,
            'diagnoses_per_class' => Diagnosis::query()->selectRaw('predicted_class, COUNT(*) as total')->groupBy('predicted_class')->pluck('total', 'predicted_class'),
            'diagnoses_per_source' => Diagnosis::query()->selectRaw('source, COUNT(*) as total')->groupBy('source')->pluck('total', 'source'),
            'diagnoses_over_time' => $daily,
            'recent_diagnoses' => DiagnosisResource::collection(Diagnosis::query()->with(['user', 'disease'])->latest('diagnosed_at')->limit(10)->get()),
            'model_review_analytics' => [
                'reviewed_diagnoses' => $reviews->count(),
                'comparable_reviews' => $determinate->count(),
                'agreement_rate' => $determinate->count() ? round(($agreements / $determinate->count()) * 100, 2) : null,
                'disagreements' => $disagreements->count(),
                'average_disagreement_confidence' => $disagreements->count() ? round((float) $disagreements->avg(fn ($review) => $review->diagnosis?->confidence), 2) : null,
                'disagreements_by_predicted_class' => $disagreements->groupBy(fn ($review) => $review->diagnosis?->predicted_class)->map->count()->sortDesc(),
                'unable_to_determine' => $reviews->where('review_status', 'cannot_determine')->count(),
                'field_inspection_required' => $reviews->where('requires_field_inspection', true)->count(),
                'possible_outside_supported_classes' => $reviews->where('review_status', 'possible_outside_supported_classes')->count(),
                'most_confused_classes' => $disagreements->groupBy(fn ($review) => $review->diagnosis?->predicted_class.' → '.$review->verified_label)
                    ->map->count()->sortDesc()->take(5),
                'agreement_by_confidence' => $agreementByConfidence,
                'reference_standard_note' => 'These are AI–agricultural reviewer agreement statistics, not diagnostic accuracy, unless the study protocol establishes the reviews as a valid reference standard.',
            ],
            'dataset_candidates' => [
                'pending' => DatasetCandidate::query()->where('status', 'pending')->count(),
                'approved' => DatasetCandidate::query()->where('status', 'approved')->count(),
                'rejected' => DatasetCandidate::query()->where('status', 'rejected')->count(),
                'uncertain' => DatasetCandidate::query()->where('status', 'uncertain')->count(),
            ],
        ]]);
    }
}
