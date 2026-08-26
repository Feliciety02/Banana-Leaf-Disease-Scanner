<?php

namespace App\Repositories;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\DiagnosisReview;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class DiagnosisRepository implements DiagnosisRepositoryInterface
{
    private const DETAILS = ['disease', 'review.expert'];

    public function paginateForUser(User $user, array $filters, int $perPage): LengthAwarePaginator
    {
        $query = $user->diagnoses()
            ->with(self::DETAILS)
            ->latest('diagnosed_at');

        foreach (['predicted_class' => '=', 'confidence_min' => '>=', 'confidence_max' => '<='] as $filter => $operator) {
            if (array_key_exists($filter, $filters)) {
                $column = str_starts_with($filter, 'confidence_') ? 'confidence' : $filter;
                $query->where($column, $operator, $filters[$filter]);
            }
        }
        if (array_key_exists('date', $filters)) {
            $query->whereDate('diagnosed_at', $filters['date']);
        }

        return $query->paginate($perPage);
    }

    public function paginateAll(array $filters, int $perPage): LengthAwarePaginator
    {
        $query = Diagnosis::query()
            ->with(['user', ...self::DETAILS])
            ->latest('diagnosed_at');

        foreach (['user_id' => '=', 'predicted_class' => '=', 'source' => '=', 'confidence_min' => '>=', 'confidence_max' => '<='] as $filter => $operator) {
            if (array_key_exists($filter, $filters)) {
                $column = str_starts_with($filter, 'confidence_') ? 'confidence' : $filter;
                $query->where($column, $operator, $filters[$filter]);
            }
        }
        foreach (['date_from' => '>=', 'date_to' => '<='] as $filter => $operator) {
            if (array_key_exists($filter, $filters)) {
                $query->whereDate('diagnosed_at', $operator, $filters[$filter]);
            }
        }

        return $query->paginate($perPage);
    }

    public function create(array $attributes): Diagnosis
    {
        return Diagnosis::query()->create($attributes);
    }

    public function findBySyncUuid(string $syncUuid): ?Diagnosis
    {
        return Diagnosis::query()->where('sync_uuid', $syncUuid)->first();
    }

    public function findOwnedBySyncUuid(string $syncUuid, int $userId): Diagnosis
    {
        return Diagnosis::query()
            ->where('sync_uuid', $syncUuid)
            ->where('user_id', $userId)
            ->firstOrFail();
    }

    public function withDetails(Diagnosis $diagnosis, bool $includeUser = false): Diagnosis
    {
        return $diagnosis->load($includeUser ? ['user', ...self::DETAILS] : self::DETAILS);
    }

    public function update(Diagnosis $diagnosis, array $attributes): Diagnosis
    {
        $diagnosis->update($attributes);

        return $diagnosis->fresh();
    }

    public function delete(Diagnosis $diagnosis): void
    {
        $diagnosis->delete();
    }

    public function reviewCases(string $scope, float $threshold, int $limit = 100): Collection
    {
        $query = Diagnosis::query()->with(['user', ...self::DETAILS])->latest('diagnosed_at');

        if ($scope === 'reviewed') {
            $query->whereHas('review', fn ($review) => $review->where('review_status', '!=', 'pending'));
        } else {
            $this->applyPendingReviewScope($query, $threshold);
        }

        return $query->limit($limit)->get();
    }

    public function expertDashboard(float $threshold, int $limit = 100): array
    {
        $query = Diagnosis::query();
        $this->applyPendingReviewScope($query, $threshold);

        return [
            'pending_requests' => DiagnosisReview::query()->where('review_status', 'pending')->count(),
            'uncertain' => Diagnosis::query()
                ->where('confidence', '<', $threshold)
                ->whereDoesntHave('review', fn ($review) => $review->where('review_status', '!=', 'pending'))
                ->count(),
            'needs_review' => (clone $query)->count(),
            'cases' => $query->with(['user', ...self::DETAILS])->latest('diagnosed_at')->limit($limit)->get(),
        ];
    }

    public function saveReview(Diagnosis $diagnosis, array $attributes): Diagnosis
    {
        $diagnosis->review()->updateOrCreate(
            ['diagnosis_id' => $diagnosis->id],
            $attributes,
        );

        return $this->withDetails($diagnosis, true);
    }

    private function applyPendingReviewScope($query, float $threshold): void
    {
        $query->where(function ($cases) use ($threshold) {
            $cases->where('confidence', '<', $threshold)
                ->orWhereHas('review', fn ($review) => $review->where('review_status', 'pending'));
        })->whereDoesntHave('review', fn ($review) => $review->where('review_status', '!=', 'pending'));
    }
}
