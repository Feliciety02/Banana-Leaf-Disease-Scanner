<?php

namespace App\Http\Controllers;

use App\Models\Disease;
use App\Models\MobileDiagnosis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileDiagnosisController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $deviceId = $request->string('device_id')->toString();
        $query = $request->user()->diagnoses()->with('disease')->latest('diagnosed_at');
        if ($deviceId !== '') {
            $query->where('device_id', $deviceId);
        }

        return response()->json(['data' => $query->paginate(50)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateDiagnosis($request->all());
        $diagnosis = $this->persist($validated, $request->user()->id);

        return response()->json(['data' => $diagnosis->load('disease')], 201);
    }

    public function validateDiagnosis(array $payload): array
    {
        return validator($payload, [
            'id' => ['required', 'string', 'max:100'],
            'deviceId' => ['nullable', 'string', 'max:150'],
            'diseaseId' => ['required', 'string', 'exists:diseases,slug'],
            'confidence' => ['required', 'numeric', 'between:0,100'],
            'latency' => ['required', 'integer', 'min:0'],
            'modelVersion' => ['required', 'string', 'max:100'],
            'diagnosedAt' => ['required', 'date'],
        ])->validate();
    }

    public function persist(array $validated, int $userId): MobileDiagnosis
    {
        $disease = Disease::query()->where('slug', $validated['diseaseId'])->firstOrFail();

        return MobileDiagnosis::query()->updateOrCreate(
            ['client_id' => $validated['id'], 'user_id' => $userId],
            [
                'device_id' => $validated['deviceId'] ?? 'unregistered-device',
                'disease_id' => $disease->id,
                'predicted_class' => $disease->slug,
                'confidence' => $validated['confidence'],
                'model_version' => $validated['modelVersion'],
                'inference_time_ms' => $validated['latency'],
                'diagnosed_at' => $validated['diagnosedAt'],
                'received_at' => now(),
            ],
        );
    }
}
