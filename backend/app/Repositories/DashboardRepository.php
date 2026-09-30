<?php

namespace App\Repositories;

use App\Contracts\Repositories\DashboardRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\DiagnosisReview;

class DashboardRepository implements DashboardRepositoryInterface
{
    public function snapshot(float $confidenceThreshold): array
    {
        return [
            'diagnoses' => Diagnosis::query()->get(['predicted_class', 'confidence', 'source', 'diagnosed_at']),
            'total_diagnoses' => Diagnosis::query()->count(),
            'uncertain_predictions' => Diagnosis::query()->where('confidence', '<', $confidenceThreshold)->count(),
            'reviews' => DiagnosisReview::query()->whereHas('diagnosis')->with('diagnosis:id,predicted_class,confidence')->where('review_status', '!=', 'pending')->get(),
            'diagnoses_today' => Diagnosis::query()->whereDate('diagnosed_at', today())->count(),
            'average_confidence' => Diagnosis::query()->avg('confidence'),
            'simulated_predictions' => Diagnosis::query()->where('is_simulated', true)->count(),
            // The server only stores synchronized records; the gap it can see is a
            // shared scan (review request or research consent) still missing its photo.
            'awaiting_image_uploads' => Diagnosis::query()
                ->whereNull('image_path')
                ->where(fn ($query) => $query
                    ->whereHas('review', fn ($review) => $review->where('review_status', 'pending'))
                    ->orWhere(fn ($consent) => $consent->whereNotNull('research_consented_at')->whereNull('research_consent_withdrawn_at')))
                ->count(),
            'healthy_predictions' => Diagnosis::query()->where('predicted_class', 'healthy')->count(),
            'diseased_predictions' => Diagnosis::query()->where('predicted_class', '!=', 'healthy')->count(),
            'diagnoses_per_class' => Diagnosis::query()->selectRaw('predicted_class, COUNT(*) as total')->groupBy('predicted_class')->pluck('total', 'predicted_class'),
            'diagnoses_per_source' => Diagnosis::query()->selectRaw('source, COUNT(*) as total')->groupBy('source')->pluck('total', 'source'),
            'recent_diagnoses' => Diagnosis::query()->with(['user', 'disease'])->latest('diagnosed_at')->limit(10)->get(),
        ];
    }
}
