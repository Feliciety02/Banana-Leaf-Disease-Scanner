<?php

namespace App\Repositories;

use App\Contracts\Repositories\ResearchSourceRepositoryInterface;
use App\Models\ResearchSource;
use Illuminate\Database\Eloquent\Collection;

class ResearchSourceRepository implements ResearchSourceRepositoryInterface
{
    public function all(array $filters): Collection
    {
        $query = ResearchSource::query()
            ->with(['evidence.disease:id,name'])
            ->withCount('evidence')
            ->latest('year');

        if (array_key_exists('search', $filters)) {
            $search = $filters['search'];
            $query->where(fn ($nested) => $nested->where('title', 'like', "%{$search}%")
                ->orWhere('authors', 'like', "%{$search}%")
                ->orWhere('journal_or_institution', 'like', "%{$search}%"));
        }
        foreach (['peer_reviewed', 'philippines_specific'] as $booleanFilter) {
            if ($filters[$booleanFilter] ?? false) {
                $query->where($booleanFilter, true);
            }
        }
        if (array_key_exists('institution', $filters)) {
            $query->where('journal_or_institution', 'like', '%'.$filters['institution'].'%');
        }
        if (array_key_exists('disease_id', $filters)) {
            $query->whereHas('evidence', fn ($evidence) => $evidence->where('disease_id', $filters['disease_id']));
        }

        return $query->get();
    }

    public function findOrFail(int $id): ResearchSource
    {
        return ResearchSource::query()->findOrFail($id);
    }

    public function create(array $attributes): ResearchSource
    {
        return ResearchSource::query()->create($attributes);
    }

    public function update(ResearchSource $source, array $attributes): ResearchSource
    {
        $source->update($attributes);

        return $source->fresh();
    }

    public function hasEvidence(ResearchSource $source): bool
    {
        return $source->evidence()->exists();
    }

    public function delete(ResearchSource $source): void
    {
        $source->delete();
    }
}
