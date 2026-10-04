<?php

namespace App\Services;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\DiagnosisSyncChange;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MobileSyncService
{
    public function __construct(
        private readonly DiagnosisRepositoryInterface $diagnoses,
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly DiagnosisService $diagnosisRecords,
        private readonly PrivateDiagnosisImageStorage $images,
    ) {}

    public function process(User $user, array $items): array
    {
        $results = [];

        foreach ($items as $item) {
            $validator = Validator::make($item, [
                'sync_uuid' => ['required', 'uuid'], 'predicted_class' => ['required', 'string', 'max:100', Rule::in(config('banana.class_labels', []))],
                'confidence' => ['required', 'numeric', 'between:0,100'], 'model_version' => ['nullable', 'string', 'max:100'],
                'inference_time_ms' => ['nullable', 'integer', 'min:0'], 'farmer_notes' => ['nullable', 'string', 'max:1000'], 'diagnosed_at' => ['required', 'date'],
                'research_consent' => ['sometimes', 'boolean'],
                'source' => ['sometimes', Rule::in(['mobile', 'web'])],
                'is_simulated' => ['sometimes', 'boolean'],
                ...self::locationRules(),
                ...self::predictionDetailRules(),
            ]);
            if ($validator->fails()) {
                $results[] = ['sync_uuid' => $item['sync_uuid'] ?? null, 'status' => 'rejected', 'errors' => $validator->errors()];

                continue;
            }

            $data = $validator->validated();
            $researchConsent = (bool) ($data['research_consent'] ?? false);
            unset($data['research_consent']);
            $existing = $this->diagnoses->findBySyncUuid($data['sync_uuid']);
            if ($existing) {
                $owned = $existing->user_id === $user->id;
                $matchesOriginal = $owned && $this->matchesOriginalPrediction($existing, $data);
                $results[] = [
                    'sync_uuid' => $data['sync_uuid'],
                    'status' => $matchesOriginal ? 'already_synchronized' : 'rejected',
                    'diagnosis_id' => $matchesOriginal ? $existing->id : null,
                    ...($matchesOriginal ? [] : ['errors' => ['sync_uuid' => [
                        $owned
                            ? 'This synchronization identifier was already used for different prediction data.'
                            : 'This synchronization identifier belongs to another account.',
                    ]]]),
                ];

                continue;
            }

            $disease = $this->diseases->findByModelClassKey($data['predicted_class']);
            $source = $data['source'] ?? 'mobile';
            foreach (['latitude', 'longitude'] as $coordinate) {
                if (isset($data[$coordinate])) {
                    $data[$coordinate] = round((float) $data[$coordinate], 3);
                }
            }
            $reportedSimulated = isset($data['is_simulated']) ? (bool) $data['is_simulated'] : null;
            unset($data['source'], $data['is_simulated']);
            $diagnosis = $this->diagnoses->create([
                ...$data,
                'user_id' => $user->id,
                'disease_id' => $disease?->id,
                'source' => $source,
                'is_simulated' => Diagnosis::isSimulatedFor($source, $reportedSimulated),
                'sync_status' => 'synced',
                'research_consented_at' => $researchConsent ? now() : null,
                'research_consent_version' => $researchConsent ? config('banana.research_consent_version') : null,
            ]);
            $results[] = ['sync_uuid' => $data['sync_uuid'], 'status' => 'created', 'diagnosis_id' => $diagnosis->id];
        }

        return $results;
    }

    public function processDeletions(User $user, array $items): array
    {
        $results = [];

        foreach ($items as $item) {
            $validator = Validator::make($item, [
                'server_id' => ['nullable', 'required_without:sync_uuid', 'integer', 'min:1'],
                'sync_uuid' => ['nullable', 'required_without:server_id', 'uuid'],
            ]);
            if ($validator->fails()) {
                $results[] = ['server_id' => $item['server_id'] ?? null, 'status' => 'rejected', 'errors' => $validator->errors()];

                continue;
            }

            $data = $validator->validated();
            $diagnosis = isset($data['server_id'])
                ? $this->diagnoses->findWithTrashed($data['server_id'])
                : $this->diagnoses->findBySyncUuid($data['sync_uuid']);
            if (! $diagnosis) {
                $results[] = [
                    'server_id' => $data['server_id'] ?? null,
                    'sync_uuid' => $data['sync_uuid'] ?? null,
                    'status' => 'already_deleted',
                ];

                continue;
            }
            $owned = $diagnosis->user_id === $user->id;
            $uuidMatches = ! isset($data['sync_uuid']) || $diagnosis->sync_uuid === $data['sync_uuid'];
            if (! $owned || ! $uuidMatches) {
                $results[] = [
                    'server_id' => $data['server_id'] ?? null,
                    'sync_uuid' => $data['sync_uuid'] ?? null,
                    'status' => 'rejected',
                    'errors' => ['server_id' => ['The diagnosis was not found for this account or its synchronization identifier did not match.']],
                ];

                continue;
            }
            if ($diagnosis->trashed()) {
                $results[] = ['server_id' => $diagnosis->id, 'sync_uuid' => $diagnosis->sync_uuid, 'status' => 'already_deleted'];

                continue;
            }

            try {
                $this->diagnosisRecords->delete($diagnosis);
            } catch (ValidationException $exception) {
                $results[] = [
                    'server_id' => $diagnosis->id,
                    'sync_uuid' => $diagnosis->sync_uuid,
                    'status' => 'rejected',
                    'errors' => ['server_id' => collect($exception->errors())->flatten()->all()],
                ];

                continue;
            }
            $results[] = ['server_id' => $diagnosis->id, 'sync_uuid' => $diagnosis->sync_uuid, 'status' => 'deleted'];
        }

        return $results;
    }

    public function changes(User $user, ?string $cursor, int $limit): array
    {
        $lastChangeId = $this->decodeCursor($cursor);
        $records = $this->diagnoses->syncChanges($user, $lastChangeId, $limit + 1);
        $hasMore = $records->count() > $limit;
        $page = $records->take($limit)->values();
        $last = $page->last();

        return [
            'records' => $page,
            'next_cursor' => $last ? $this->encodeCursor($last) : $cursor,
            'has_more' => $hasMore,
        ];
    }

    /** An optional scan location; both coordinates are needed together. */
    public static function locationRules(): array
    {
        return [
            'latitude' => ['nullable', 'required_with:longitude', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'required_with:latitude', 'numeric', 'between:-180,180'],
        ];
    }

    /**
     * Optional per-class probabilities (0..1, keyed by class label) and the
     * on-device baseline/enhanced comparison recorded with a mobile scan.
     */
    public static function predictionDetailRules(): array
    {
        $labels = config('banana.class_labels', []);
        $probabilityMap = static function (string $attribute, mixed $value, \Closure $fail) use ($labels): void {
            if (! is_array($value) || array_diff(array_keys($value), $labels) !== []) {
                $fail("The {$attribute} keys must be supported class labels.");
            }
        };

        return [
            'class_probabilities' => ['nullable', 'array', $probabilityMap],
            'class_probabilities.*' => ['numeric', 'between:0,1'],
            'model_comparison' => ['nullable', 'array:baseline,enhanced'],
            'model_comparison.*' => ['array:predicted_class,confidence,inference_time_ms,model,probabilities'],
            'model_comparison.*.predicted_class' => ['required', Rule::in($labels)],
            'model_comparison.*.confidence' => ['required', 'numeric', 'between:0,1'],
            'model_comparison.*.inference_time_ms' => ['nullable', 'numeric', 'min:0'],
            'model_comparison.*.model' => ['nullable', 'string', 'max:100'],
            'model_comparison.*.probabilities' => ['nullable', 'array', $probabilityMap],
            'model_comparison.*.probabilities.*' => ['numeric', 'between:0,1'],
        ];
    }

    private function matchesOriginalPrediction(Diagnosis $diagnosis, array $data): bool
    {
        return $diagnosis->predicted_class === $data['predicted_class']
            && abs($diagnosis->confidence - (float) $data['confidence']) < 0.005
            && $diagnosis->model_version === ($data['model_version'] ?? null)
            && $diagnosis->inference_time_ms === ($data['inference_time_ms'] ?? null)
            && $diagnosis->source === ($data['source'] ?? 'mobile')
            // Clients send millisecond timestamps but the column keeps whole seconds,
            // so a retried upload must be compared at second precision.
            && $diagnosis->diagnosed_at->copy()->startOfSecond()->equalTo(Carbon::parse($data['diagnosed_at'])->startOfSecond());
    }

    private function encodeCursor(DiagnosisSyncChange $change): string
    {
        $json = json_encode(['id' => $change->id], JSON_THROW_ON_ERROR);

        return rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
    }

    private function decodeCursor(?string $cursor): int
    {
        if (! $cursor) {
            return 0;
        }

        try {
            $padding = str_repeat('=', (4 - strlen($cursor) % 4) % 4);
            $decoded = base64_decode(strtr($cursor.$padding, '-_', '+/'), true);
            $value = json_decode($decoded ?: '', true, flags: JSON_THROW_ON_ERROR);
            if (! is_array($value) || ! isset($value['id']) || ! is_int($value['id']) || $value['id'] < 0) {
                throw new \UnexpectedValueException;
            }

            return $value['id'];
        } catch (\Throwable) {
            throw ValidationException::withMessages(['cursor' => 'The synchronization cursor is invalid or expired.']);
        }
    }

    /**
     * Stores the scan photo of a synchronized record, as web scans keep theirs.
     * Research dataset use is still gated by consent when an image is nominated.
     */
    public function storeImage(User $user, string $syncUuid, UploadedFile $image): bool
    {
        $diagnosis = $this->diagnoses->findOwnedBySyncUuid($syncUuid, $user->id);
        if ($diagnosis->image_path) {
            return false;
        }

        $this->diagnoses->update($diagnosis, ['image_path' => $this->images->store($image)]);

        return true;
    }
}
