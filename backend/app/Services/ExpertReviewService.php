<?php

namespace App\Services;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Support\Collection;

class ExpertReviewService
{
    public function __construct(
        private readonly DiagnosisRepositoryInterface $diagnoses,
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly ReviewPriorityService $priority,
    ) {}

    public function cases(string $scope): Collection
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $cases = $this->diagnoses->reviewCases($scope, $confidenceThreshold);

        return $scope === 'reviewed' ? $cases : $this->priority->rank($cases, $confidenceThreshold);
    }

    public function dashboard(): array
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $summary = $this->diagnoses->expertDashboard($confidenceThreshold);

        return [
            'needs_review' => $summary['needs_review'],
            'uncertain_results' => $summary['uncertain'],
            'farmer_review_requests' => $summary['pending_requests'],
            'disease_content_awaiting_verification' => $this->diseases->countByVerificationStatus('researched'),
            'cases' => $this->priority->rank($summary['cases'], $confidenceThreshold)->take(6),
        ];
    }

    public function details(Diagnosis $diagnosis): Diagnosis
    {
        return $this->diagnoses->withDetails($diagnosis, true);
    }

    public function save(User $expert, Diagnosis $diagnosis, array $attributes): Diagnosis
    {
        if ($attributes['review_status'] !== 'alternate_class') {
            $attributes['verified_label'] = $attributes['review_status'] === 'confirmed' ? $diagnosis->predicted_class : null;
        }

        return $this->diagnoses->saveReview($diagnosis, [
            ...$attributes,
            'expert_id' => $expert->id,
            'requires_field_inspection' => $attributes['review_status'] === 'field_or_laboratory_required'
                || in_array('seek_field_inspection', $attributes['next_steps'], true),
            'reviewed_at' => now(),
        ]);
    }
}
