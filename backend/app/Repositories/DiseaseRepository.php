<?php

namespace App\Repositories;

use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\Disease;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class DiseaseRepository implements DiseaseRepositoryInterface
{
    private const SCIENTIFIC_CONTENT = [
        'symptomRecords',
        'managementRecords.regulatoryChecks',
        'evidence.source',
    ];

    public function verified(): Collection
    {
        return Disease::query()
            ->where('verification_status', 'verified')
            ->where('is_verified', true)
            ->with(self::SCIENTIFIC_CONTENT)
            ->orderBy('id')
            ->get();
    }

    public function findBySlug(string $slug): ?Disease
    {
        return Disease::query()->where('slug', $slug)->first();
    }

    public function withScientificContent(Disease $disease): Disease
    {
        return $disease->load(self::SCIENTIFIC_CONTENT);
    }

    public function forAdministration(array $filters, bool $withVerifications = false): Collection
    {
        $query = Disease::query()
            ->withCount(['evidence as sources_count' => fn ($evidence) => $evidence->select(DB::raw('count(distinct source_id)'))])
            ->when($withVerifications, fn ($diseases) => $diseases->with(['verifications.expert:id,name']))
            ->orderBy('name');

        if (array_key_exists('status', $filters)) {
            $query->where('verification_status', $filters['status']);
        }
        if (array_key_exists('search', $filters)) {
            $search = $filters['search'];
            $query->where(fn ($nested) => $nested->where('name', 'like', "%{$search}%")
                ->orWhere('causal_agent', 'like', "%{$search}%"));
        }

        return $query->get();
    }

    public function withAdministrationDetails(Disease $disease): Disease
    {
        return $disease
            ->load(['symptomRecords', 'managementRecords.regulatoryChecks.source', 'evidence.source', 'verifier', 'verifications.expert:id,name'])
            ->loadCount(['evidence as sources_count' => fn ($query) => $query->select(DB::raw('count(distinct source_id)'))]);
    }

    public function create(array $attributes): Disease
    {
        return Disease::query()->create($attributes);
    }

    public function update(Disease $disease, array $attributes): Disease
    {
        $disease->update($attributes);

        return $disease->fresh();
    }

    public function invalidateVerification(Disease $disease): void
    {
        if ($disease->is_verified) {
            $disease->update([
                'verification_status' => 'researched',
                'is_verified' => false,
                'verified_at' => null,
                'verified_by' => null,
            ]);
        }
    }

    public function countByVerificationStatus(string $status): int
    {
        return Disease::query()->where('verification_status', $status)->count();
    }
}
