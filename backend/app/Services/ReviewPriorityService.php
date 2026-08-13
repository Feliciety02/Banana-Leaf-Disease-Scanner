<?php

namespace App\Services;

use Illuminate\Support\Collection;

class ReviewPriorityService
{
    public function rank(Collection $diagnoses): Collection
    {
        $threshold = (float) config('banana.confidence_threshold');
        $repeated = $diagnoses->groupBy(fn ($item) => $item->user_id.'|'.$item->predicted_class)->map->count();

        return $diagnoses->map(function ($diagnosis) use ($threshold, $repeated) {
            $requested = $diagnosis->review?->review_status === 'pending';
            $repeatCount = $repeated[$diagnosis->user_id.'|'.$diagnosis->predicted_class] ?? 1;
            $score = ($requested ? 100 : 0)
                + ($diagnosis->confidence < $threshold ? 50 + ($threshold - $diagnosis->confidence) : 0)
                + max(0, $repeatCount - 1) * 15;
            $reasons = collect([
                $requested ? 'Farmer requested review' : null,
                $diagnosis->confidence < $threshold ? 'Low confidence' : null,
                $repeatCount > 1 ? "Repeated uncertain scan ({$repeatCount})" : null,
            ])->filter()->values()->all();
            $diagnosis->setAttribute('review_priority', round($score, 2));
            $diagnosis->setAttribute('review_reasons', $reasons);

            return $diagnosis;
        })->sortByDesc('review_priority')->values();
    }
}
