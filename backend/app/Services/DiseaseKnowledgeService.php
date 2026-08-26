<?php

namespace App\Services;

use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Contracts\Repositories\ResearchSourceRepositoryInterface;
use App\Models\Disease;
use App\Models\DiseaseEvidence;
use App\Models\DiseaseManagement;
use App\Models\DiseaseSymptom;
use App\Models\PesticideRegulatoryCheck;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class DiseaseKnowledgeService
{
    public function __construct(
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly ResearchSourceRepositoryInterface $sources,
    ) {}

    public function create(array $attributes, ?UploadedFile $image): Disease
    {
        return $this->diseases->create([
            ...$this->contentData($attributes, $image),
            'verification_status' => 'draft',
            'is_verified' => false,
        ]);
    }

    public function update(Disease $disease, array $attributes, ?UploadedFile $image): array
    {
        $returnedForReview = $disease->is_verified;
        $data = $this->contentData($attributes, $image, $disease);
        if ($returnedForReview) {
            $data = [...$data, 'verification_status' => 'researched', 'is_verified' => false, 'verified_at' => null, 'verified_by' => null];
        }

        return ['disease' => $this->diseases->update($disease, $data), 'returned_for_review' => $returnedForReview];
    }

    public function setStatus(Disease $disease, string $status): Disease
    {
        return $this->diseases->update($disease, [
            'verification_status' => $status,
            'is_verified' => false,
            'verified_at' => null,
            'verified_by' => null,
        ]);
    }

    public function addSymptom(Disease $disease, array $attributes): DiseaseSymptom
    {
        $symptom = $disease->symptomRecords()->create($attributes);
        $this->diseases->invalidateVerification($disease);

        return $symptom;
    }

    public function deleteSymptom(Disease $disease, DiseaseSymptom $symptom): void
    {
        abort_unless($symptom->disease_id === $disease->id, 404);
        $symptom->delete();
        $this->diseases->invalidateVerification($disease);
    }

    public function addManagement(Disease $disease, array $attributes): DiseaseManagement
    {
        if ($attributes['category'] === 'chemical' && ! $attributes['regulatory_check_required']) {
            throw ValidationException::withMessages(['regulatory_check_required' => 'Chemical guidance must require a current Philippine regulatory check.']);
        }

        $management = $disease->managementRecords()->create($attributes);
        $this->diseases->invalidateVerification($disease);

        return $management;
    }

    public function deleteManagement(Disease $disease, DiseaseManagement $management): void
    {
        abort_unless($management->disease_id === $disease->id, 404);
        $management->delete();
        $this->diseases->invalidateVerification($disease);
    }

    public function addRegulatoryCheck(User $user, Disease $disease, DiseaseManagement $management, array $attributes): PesticideRegulatoryCheck
    {
        abort_unless($management->disease_id === $disease->id && $management->category === 'chemical', 404);
        $source = $this->sources->findOrFail($attributes['source_id']);
        if ($source->source_type !== 'regulatory_document') {
            throw ValidationException::withMessages(['source_id' => 'Pesticide registration checks require an official regulatory-document source.']);
        }

        $check = $management->regulatoryChecks()->create([...$attributes, 'checked_by' => $user->id]);
        $management->update(['regulatory_check_required' => true, 'regulatory_checked_at' => $check->checked_at]);
        $this->diseases->invalidateVerification($disease);

        return $check->load('source');
    }

    public function addEvidence(Disease $disease, array $attributes): DiseaseEvidence
    {
        $evidence = $disease->evidence()->create($attributes);
        $this->diseases->invalidateVerification($disease);

        return $evidence->load('source');
    }

    public function deleteEvidence(Disease $disease, DiseaseEvidence $evidence): void
    {
        abort_unless($evidence->disease_id === $disease->id, 404);
        $evidence->delete();
        $this->diseases->invalidateVerification($disease);
    }

    public function archive(Disease $disease): Disease
    {
        return $this->setStatus($disease, 'archived');
    }

    public function administrationDetails(Disease $disease): array
    {
        $disease = $this->diseases->withAdministrationDetails($disease);
        $regulatoryRecheckRequired = $disease->managementRecords->contains(function ($item) {
            if ($item->category === 'chemical') {
                return ! $item->regulatoryChecks->contains(fn ($check) => $check->registration_status === 'registered'
                    && $check->checked_at->gte(now()->subMonths(config('banana.regulatory_review_months')))
                    && (! $check->registration_expires_at || $check->registration_expires_at->isFuture()));
            }

            return $item->regulatory_check_required
                && (! $item->regulatory_checked_at || $item->regulatory_checked_at->lt(now()->subMonths(config('banana.regulatory_review_months'))));
        });

        return ['disease' => $disease, 'regulatory_recheck_required' => $regulatoryRecheckRequired];
    }

    private function contentData(array $attributes, ?UploadedFile $image, ?Disease $disease = null): array
    {
        $attributes['description'] = $attributes['farmer_summary'] ?? 'Insufficient verified evidence available.';
        $attributes['symptoms'] = $disease?->symptoms ?? [];
        $attributes['management'] = $disease?->management ?? 'Insufficient verified evidence available.';

        if ($image) {
            if ($disease?->image_path) {
                Storage::disk('public')->delete($disease->image_path);
            }
            $attributes['image_path'] = $image->store('diseases', 'public');
        }

        return $attributes;
    }
}
