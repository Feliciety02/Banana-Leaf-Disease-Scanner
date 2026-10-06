<?php

namespace App\Services;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;

class InferenceReceiptService
{
    public function issue(UploadedFile $image, array $result): ?string
    {
        if (($result['is_simulated'] ?? true) || ! in_array($result['diseaseId'] ?? null, config('banana.class_labels', []), true)) {
            return null;
        }

        return Crypt::encryptString(json_encode([
            'image_hash' => hash_file('sha256', $image->getRealPath()),
            'class' => $result['diseaseId'],
            'confidence' => (float) $result['confidence'],
            'model' => $result['model'],
            'expires_at' => now()->addDays(30)->timestamp,
        ], JSON_THROW_ON_ERROR));
    }

    public function matches(?string $receipt, UploadedFile $image, array $prediction): bool
    {
        if (! $receipt) return false;
        try {
            $data = json_decode(Crypt::decryptString($receipt), true, flags: JSON_THROW_ON_ERROR);
        } catch (DecryptException|\JsonException) {
            return false;
        }

        return is_array($data)
            && ($data['expires_at'] ?? 0) >= now()->timestamp
            && hash_equals((string) ($data['image_hash'] ?? ''), hash_file('sha256', $image->getRealPath()))
            && ($data['class'] ?? null) === ($prediction['predicted_class'] ?? null)
            && abs((float) ($data['confidence'] ?? -100) - (float) ($prediction['confidence'] ?? -200)) < 0.1
            && ($data['model'] ?? null) === ($prediction['model_version'] ?? null);
    }
}
