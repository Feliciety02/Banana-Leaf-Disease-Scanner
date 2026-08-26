<?php

namespace App\Services;

use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\Disease;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DiseaseVerificationService
{
    public function __construct(private readonly DiseaseRepositoryInterface $diseases) {}

    public function records(?string $status = null): Collection
    {
        return $this->diseases->forAdministration($status ? ['status' => $status] : [], true);
    }

    public function assertVerifiable(Disease $disease): void
    {
        $disease->load(['evidence.source', 'symptomRecords', 'managementRecords.regulatoryChecks']);
        $sources = $disease->evidence->pluck('source')->filter()->unique('id');
        $errors = [];

        if ($sources->where('peer_reviewed', true)->count() < 2) {
            $errors['sources'][] = 'At least two peer-reviewed sources are required.';
        }

        $authoritative = ['government_guideline', 'FAO_guideline', 'university_extension', 'regulatory_document', 'research_institute'];
        if (! $sources->contains(fn ($source) => in_array($source->source_type, $authoritative, true))) {
            $errors['sources'][] = 'At least one authoritative agricultural or institutional source is required.';
        }

        $classIdentity = strtolower($disease->model_class_key.' '.$disease->name);
        $isNonDiseaseClass = str_contains($classIdentity, 'healthy') || str_contains($classIdentity, 'dead');
        foreach ($isNonDiseaseClass ? [] : ['causal_agent', 'curative_status'] as $claimType) {
            if (! $disease->evidence->contains('claim_type', $claimType)) {
                $errors['evidence'][] = "A {$claimType} claim mapping is required.";
            }
        }

        if ($disease->symptomRecords->isNotEmpty() && ! $disease->evidence->contains('claim_type', 'symptom')) {
            $errors['evidence'][] = 'Symptom content requires a symptom evidence mapping.';
        }

        if ($disease->managementRecords->isNotEmpty() && ! $disease->evidence->contains(fn ($item) => in_array($item->claim_type, ['management', 'prevention', 'chemical_management'], true))) {
            $errors['evidence'][] = 'Management content requires a management evidence mapping.';
        }

        if ($disease->managementRecords->contains(fn ($item) => $item->category === 'chemical' && ! $item->regulatoryChecks->contains(fn ($check) => $check->registration_status === 'registered' && $check->checked_at->gte(now()->subMonths(config('banana.regulatory_review_months'))) && (! $check->registration_expires_at || $check->registration_expires_at->isFuture())))) {
            $errors['regulatory'][] = 'REGULATORY RE-CHECK REQUIRED for chemical guidance.';
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    public function recordReview(User $expert, Disease $disease, array $attributes): array
    {
        if ($attributes['status'] === 'verified') {
            $this->assertVerifiable($disease);
        }

        return DB::transaction(function () use ($expert, $disease, $attributes) {
            $verification = $disease->verifications()->create([
                ...$attributes,
                'expert_id' => $expert->id,
                'verified_at' => $attributes['status'] === 'verified' ? now() : null,
            ]);
            $updatedDisease = $this->diseases->update($disease, $attributes['status'] === 'verified' ? [
                'verification_status' => 'verified', 'is_verified' => true, 'verified_at' => now(),
                'verified_by' => $expert->id, 'last_reviewed_at' => now(),
            ] : [
                'verification_status' => $attributes['status'] === 'rejected' ? 'draft' : 'researched',
                'is_verified' => false, 'verified_at' => null, 'verified_by' => null, 'last_reviewed_at' => now(),
            ]);

            return ['verification' => $verification->load('expert:id,name'), 'disease' => $updatedDisease];
        });
    }
}
