<?php

namespace App\Http\Controllers;

use App\Models\MobileDiagnosis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SyncController extends Controller
{
    public function __invoke(Request $request, MobileDiagnosisController $diagnoses): JsonResponse
    {
        $payload = $request->validate(['diagnoses' => ['required', 'array', 'max:100'], 'diagnoses.*' => ['array']]);
        $results = [];

        foreach ($payload['diagnoses'] as $item) {
            try {
                $validated = $diagnoses->validateDiagnosis($item);
                $exists = MobileDiagnosis::query()->where('client_id', $validated['id'])->first();
                if ($exists) {
                    $results[] = ['id' => $validated['id'], 'status' => $exists->user_id === $request->user()->id ? 'already_synchronized' : 'rejected'];

                    continue;
                }
                $diagnoses->persist($validated, $request->user()->id);
                $results[] = ['id' => $validated['id'], 'status' => 'created'];
            } catch (ValidationException $exception) {
                $results[] = ['id' => $item['id'] ?? null, 'status' => 'rejected', 'errors' => $exception->errors()];
            }
        }

        return response()->json(['success' => true, 'message' => 'Synchronization processed.', 'data' => ['results' => $results]]);
    }
}
