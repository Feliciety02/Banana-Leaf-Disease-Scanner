<?php

namespace App\Services;

use App\Contracts\Repositories\DashboardRepositoryInterface;
use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\Diagnosis;

class DashboardService
{
    public function __construct(
        private readonly DashboardRepositoryInterface $dashboard,
        private readonly UserRepositoryInterface $users,
        private readonly DatasetCandidateRepositoryInterface $candidates,
    ) {}

    public function analytics(): array
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $snapshot = $this->dashboard->snapshot($confidenceThreshold);
        $daily = $snapshot['diagnoses']->groupBy(fn (Diagnosis $diagnosis) => $diagnosis->diagnosed_at->toDateString())
            ->map->count()->sortKeys();
        $totalDiagnoses = $snapshot['total_diagnoses'];
        $uncertainPredictions = $snapshot['uncertain_predictions'];
        $reviews = $snapshot['reviews'];
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

        return [
            'total_farmers' => $this->users->countByRole('farmer'),
            'total_diagnoses' => $totalDiagnoses,
            'diagnoses_today' => $snapshot['diagnoses_today'],
            'average_confidence' => round((float) $snapshot['average_confidence'], 2),
            'uncertain_predictions' => $uncertainPredictions,
            'uncertain_prediction_rate' => $totalDiagnoses ? round(($uncertainPredictions / $totalDiagnoses) * 100, 2) : 0,
            'simulated_predictions' => $snapshot['simulated_predictions'],
            'pending_or_failed_syncs' => $snapshot['pending_or_failed_syncs'],
            'healthy_predictions' => $snapshot['healthy_predictions'],
            'dead_predictions' => $snapshot['dead_predictions'],
            'diseased_predictions' => $snapshot['diseased_predictions'],
            'confidence_threshold' => $confidenceThreshold,
            'diagnoses_per_class' => $snapshot['diagnoses_per_class'],
            'diagnoses_per_source' => $snapshot['diagnoses_per_source'],
            'diagnoses_over_time' => $daily,
            'recent_diagnoses' => $snapshot['recent_diagnoses'],
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
                'most_confused_classes' => $disagreements->groupBy(fn ($review) => $review->diagnosis?->predicted_class.' â†’ '.$review->verified_label)
                    ->map->count()->sortDesc()->take(5),
                'agreement_by_confidence' => $agreementByConfidence,
                'reference_standard_note' => 'These are AIâ€“agricultural reviewer agreement statistics, not diagnostic accuracy, unless the study protocol establishes the reviews as a valid reference standard.',
            ],
            'dataset_candidates' => [
                'pending' => $this->candidates->countByStatus('pending'),
                'approved' => $this->candidates->countByStatus('approved'),
                'rejected' => $this->candidates->countByStatus('rejected'),
                'uncertain' => $this->candidates->countByStatus('uncertain'),
            ],
        ];
    }
}
