<?php

namespace App\Services;

use App\Contracts\Repositories\DashboardRepositoryInterface;
use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\DiagnosisReview;

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
        $determinate = $snapshot['verified_reviews']->whereIn('review_status', ['confirmed', 'alternate_class']);
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
            'average_confidence' => $snapshot['average_confidence'] === null ? null : round((float) $snapshot['average_confidence'], 2),
            'verified_predictions' => $snapshot['verified_predictions'],
            'unverified_predictions' => $snapshot['unverified_predictions'],
            'uncertain_predictions' => $uncertainPredictions,
            'uncertain_prediction_rate' => $totalDiagnoses ? round(($uncertainPredictions / $totalDiagnoses) * 100, 2) : 0,
            'simulated_predictions' => $snapshot['simulated_predictions'],
            'awaiting_image_uploads' => $snapshot['awaiting_image_uploads'],
            'healthy_predictions' => $snapshot['healthy_predictions'],
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
                'most_confused_classes' => $disagreements->groupBy(fn ($review) => $review->diagnosis?->predicted_class.' → '.$review->verified_label)
                    ->map->count()->sortDesc()->take(5),
                'agreement_by_confidence' => $agreementByConfidence,
                'reference_standard_note' => 'Agreement uses only server-verified predictions. On-device and older client-reported results are excluded. These are not diagnostic accuracy statistics without a valid reference standard.',
            ],
            'review_turnaround' => $this->reviewTurnaround(),
            'dataset_candidates' => [
                'pending' => $this->candidates->countByStatus('pending'),
                'approved' => $this->candidates->countByStatus('approved'),
                'rejected' => $this->candidates->countByStatus('rejected'),
                'uncertain' => $this->candidates->countByStatus('uncertain'),
            ],
        ];
    }

    /**
     * How quickly farmers get an answer: what is waiting now, and how long
     * completed reviews took over the last 30 days (request to assessment).
     */
    private function reviewTurnaround(): array
    {
        $overdueDays = (int) config('banana.review_overdue_days', 3);
        $waiting = DiagnosisReview::query()->whereHas('diagnosis')->where('review_status', 'pending')->whereNotNull('requested_at');
        $oldest = (clone $waiting)->min('requested_at');
        $hours = DiagnosisReview::query()->whereHas('diagnosis')
            ->where('review_status', '!=', 'pending')
            ->whereNotNull('requested_at')->whereNotNull('reviewed_at')
            ->where('reviewed_at', '>=', now()->subDays(30))
            ->get(['requested_at', 'reviewed_at'])
            ->map(fn (DiagnosisReview $review) => max(0, $review->requested_at->diffInMinutes($review->reviewed_at)) / 60)
            ->sort()->values();

        return [
            'waiting_requests' => (clone $waiting)->count(),
            'overdue_days' => $overdueDays,
            'waiting_over_overdue' => (clone $waiting)->where('requested_at', '<', now()->subDays($overdueDays))->count(),
            'oldest_waiting_hours' => $oldest ? round(now()->diffInMinutes($oldest, true) / 60, 1) : null,
            'completed_last_30_days' => $hours->count(),
            'median_hours_last_30_days' => $hours->isEmpty() ? null : round((float) $hours->median(), 1),
            'average_hours_last_30_days' => $hours->isEmpty() ? null : round((float) $hours->avg(), 1),
        ];
    }
}
