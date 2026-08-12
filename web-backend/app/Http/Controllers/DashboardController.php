<?php

namespace App\Http\Controllers;

use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $diagnoses = Diagnosis::query()->get(['predicted_class', 'confidence', 'source', 'diagnosed_at']);
        $daily = $diagnoses->groupBy(fn (Diagnosis $diagnosis) => $diagnosis->diagnosed_at->toDateString())
            ->map->count()->sortKeys();
        $totalDiagnoses = Diagnosis::query()->count();
        $uncertainPredictions = Diagnosis::query()->where('confidence', '<', $confidenceThreshold)->count();

        return response()->json(['success' => true, 'message' => 'Dashboard analytics retrieved.', 'data' => [
            'total_farmers' => User::query()->where('role', 'farmer')->count(),
            'total_diagnoses' => $totalDiagnoses,
            'diagnoses_today' => Diagnosis::query()->whereDate('diagnosed_at', today())->count(),
            'average_confidence' => round((float) Diagnosis::query()->avg('confidence'), 2),
            'uncertain_predictions' => $uncertainPredictions,
            'uncertain_prediction_rate' => $totalDiagnoses ? round(($uncertainPredictions / $totalDiagnoses) * 100, 2) : 0,
            'simulated_predictions' => Diagnosis::query()->where('is_simulated', true)->count(),
            'pending_or_failed_syncs' => Diagnosis::query()->whereIn('sync_status', ['pending', 'failed'])->count(),
            'healthy_predictions' => Diagnosis::query()->whereHas('disease', fn ($query) => $query->whereRaw('LOWER(COALESCE(model_class_key, name)) LIKE ?', ['%healthy%']))->count(),
            'diseased_predictions' => Diagnosis::query()->whereHas('disease', fn ($query) => $query->whereRaw('LOWER(COALESCE(model_class_key, name)) NOT LIKE ?', ['%healthy%']))->count(),
            'confidence_threshold' => $confidenceThreshold,
            'diagnoses_per_class' => Diagnosis::query()->selectRaw('predicted_class, COUNT(*) as total')->groupBy('predicted_class')->pluck('total', 'predicted_class'),
            'diagnoses_per_source' => Diagnosis::query()->selectRaw('source, COUNT(*) as total')->groupBy('source')->pluck('total', 'source'),
            'diagnoses_over_time' => $daily,
            'recent_diagnoses' => DiagnosisResource::collection(Diagnosis::query()->with(['user', 'disease'])->latest('diagnosed_at')->limit(10)->get()),
        ]]);
    }
}
