<?php

namespace App\Services;

use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Contracts\Repositories\ResearchSourceRepositoryInterface;
use App\Models\ResearchSource;
use Illuminate\Validation\ValidationException;

class ResearchSourceService
{
    public function __construct(
        private readonly ResearchSourceRepositoryInterface $sources,
        private readonly DiseaseRepositoryInterface $diseases,
    ) {}

    public function create(array $attributes, int $userId): ResearchSource
    {
        return $this->sources->create([...$attributes, 'created_by' => $userId]);
    }

    public function update(ResearchSource $source, array $attributes): ResearchSource
    {
        $source->load('evidence.disease');
        $affectedDiseases = $source->evidence->pluck('disease')->filter()->unique('id');
        $source = $this->sources->update($source, $attributes);

        foreach ($affectedDiseases as $disease) {
            $this->diseases->invalidateVerification($disease);
        }

        return $source;
    }

    public function delete(ResearchSource $source): void
    {
        if ($this->sources->hasEvidence($source)) {
            throw ValidationException::withMessages(['source' => 'A source mapped to claims cannot be deleted. Remove or replace its evidence mappings first.']);
        }

        $this->sources->delete($source);
    }
}
