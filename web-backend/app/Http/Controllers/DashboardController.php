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
        return response()->json(['success' => true, 'message' => 'Dashboard analytics retrieved.', 'data' => [
            'total_users' => User::query()->count(),
            'total_diagnoses' => Diagnosis::query()->count(),
            'diagnoses_today' => Diagnosis::query()->whereDate('diagnosed_at', today())->count(),
            'average_confidence' => round((float) Diagnosis::query()->avg('confidence'), 2),
            'average_inference_time_ms' => round((float) Diagnosis::query()->avg('inference_time_ms'), 2),
            'diagnoses_per_class' => Diagnosis::query()->selectRaw('predicted_class, COUNT(*) as total')->groupBy('predicted_class')->pluck('total', 'predicted_class'),
            'diagnoses_per_source' => Diagnosis::query()->selectRaw('source, COUNT(*) as total')->groupBy('source')->pluck('total', 'source'),
            'recent_diagnoses' => DiagnosisResource::collection(Diagnosis::query()->with(['user', 'disease'])->latest('diagnosed_at')->limit(10)->get()),
        ]]);
    }
}
