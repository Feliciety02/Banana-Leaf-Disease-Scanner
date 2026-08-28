<?php

namespace Tests\Unit\Services;

use App\Models\Diagnosis;
use App\Models\DiagnosisReview;
use App\Services\ReviewPriorityService;
use Illuminate\Support\Collection;
use PHPUnit\Framework\TestCase;

class ReviewPriorityServiceTest extends TestCase
{
    public function test_it_ranks_review_requests_low_confidence_and_repeated_scans_without_a_database(): void
    {
        $requested = $this->diagnosis(1, 'healthy', 90, 'pending');
        $lowConfidence = $this->diagnosis(2, 'sigatoka', 50);
        $repeated = $this->diagnosis(2, 'sigatoka', 90);
        $routine = $this->diagnosis(3, 'healthy', 90);

        $ranked = (new ReviewPriorityService)->rank(
            new Collection([$routine, $repeated, $requested, $lowConfidence]),
            75,
        );

        $this->assertSame([$requested, $lowConfidence, $repeated, $routine], $ranked->all());
        $this->assertSame(100.0, $requested->review_priority);
        $this->assertSame(['Farmer requested review'], $requested->review_reasons);
        $this->assertSame(90.0, $lowConfidence->review_priority);
        $this->assertSame(['Low confidence', 'Repeated uncertain scan (2)'], $lowConfidence->review_reasons);
        $this->assertSame(15.0, $repeated->review_priority);
        $this->assertSame([], $routine->review_reasons);
    }

    public function test_the_confidence_threshold_is_an_explicit_business_rule_dependency(): void
    {
        $diagnosis = $this->diagnosis(1, 'healthy', 80);
        $service = new ReviewPriorityService;

        $service->rank(new Collection([$diagnosis]), 75);
        $this->assertSame(0.0, $diagnosis->review_priority);

        $service->rank(new Collection([$diagnosis]), 85);
        $this->assertSame(55.0, $diagnosis->review_priority);
        $this->assertSame(['Low confidence'], $diagnosis->review_reasons);
    }

    private function diagnosis(int $userId, string $predictedClass, float $confidence, ?string $reviewStatus = null): Diagnosis
    {
        $diagnosis = new Diagnosis([
            'user_id' => $userId,
            'predicted_class' => $predictedClass,
            'confidence' => $confidence,
        ]);

        $diagnosis->setRelation(
            'review',
            $reviewStatus ? new DiagnosisReview(['review_status' => $reviewStatus]) : null,
        );

        return $diagnosis;
    }
}
