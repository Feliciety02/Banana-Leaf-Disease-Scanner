<?php

namespace App\Services;

use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Models\ResearchImage;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ResearchImageService
{
    /** Make a distinct private copy while the candidate and diagnosis are locked. */
    public function approve(DatasetCandidate $candidate, Diagnosis $diagnosis, User $approver): ResearchImage
    {
        $source = $diagnosis->image_path;
        $disk = $source && Storage::disk('local')->exists($source) ? 'local' : 'public';
        if (! $source || ! Storage::disk($disk)->exists($source)) {
            throw ValidationException::withMessages(['status' => 'The scan photo is missing. Restore it before approving research use.']);
        }

        $extension = strtolower(pathinfo($source, PATHINFO_EXTENSION));
        if (! in_array($extension, ['jpg', 'jpeg', 'png', 'webp'], true)) {
            throw ValidationException::withMessages(['status' => 'The scan photo format cannot be retained for research.']);
        }
        $path = 'research-images/'.Str::uuid().'.'.$extension;
        $stream = Storage::disk($disk)->readStream($source);
        if (! is_resource($stream)) {
            throw ValidationException::withMessages(['status' => 'The scan photo could not be read for research.']);
        }
        try {
            $stored = Storage::disk('local')->writeStream($path, $stream);
        } finally {
            fclose($stream);
        }
        if (! $stored) {
            throw ValidationException::withMessages(['status' => 'The private research copy could not be stored.']);
        }

        try {
            return ResearchImage::query()->create([
                'source_user_id' => $diagnosis->user_id,
                'source_diagnosis_id' => $diagnosis->id,
                'source_candidate_id' => $candidate->id,
                'image_path' => $path,
                'sha256' => hash_file('sha256', Storage::disk('local')->path($path)),
                'verified_label' => $diagnosis->review->verified_label ?? $diagnosis->predicted_class,
                'consent_version' => $diagnosis->research_consent_version,
                'consented_at' => $diagnosis->research_consented_at,
                'approved_by' => $approver->id,
                'approved_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }
    }

    /** Mark a copy unusable in the database before deleting its file. */
    public function revoke(ResearchImage $image, ?User $actor, string $reason): ResearchImage
    {
        $locked = DB::transaction(function () use ($image, $actor, $reason) {
            $diagnosis = Diagnosis::query()->withTrashed()->whereKey($image->source_diagnosis_id)->lockForUpdate()->first();
            $locked = ResearchImage::query()->whereKey($image->id)->lockForUpdate()->firstOrFail();
            $newlyRevoked = ! $locked->revoked_at;
            if ($newlyRevoked) {
                $locked->update([
                    'revoked_at' => now(), 'revoked_by' => $actor?->id,
                    'revocation_reason' => $reason,
                ]);
                if ($diagnosis && ! $diagnosis->research_consent_withdrawn_at) {
                    $diagnosis->update(['research_consent_withdrawn_at' => now()]);
                }
            }
            $candidate = DatasetCandidate::query()->whereKey($locked->source_candidate_id)->first();
            if ($newlyRevoked && $candidate?->status === 'approved') {
                $candidate->update(['status' => 'rejected', 'review_notes' => 'Research copy removed: '.$reason, 'reviewed_by' => $actor?->id, 'reviewed_at' => now()]);
            }
            return $locked;
        });

        $this->deleteRevokedFile($locked);
        return $locked->fresh();
    }

    public function deleteRevokedFile(ResearchImage $image): void
    {
        if (! $image->revoked_at || ! $image->image_path) return;
        if (! Storage::disk('local')->exists($image->image_path) || Storage::disk('local')->delete($image->image_path)) {
            $image->update(['image_path' => null]);
        }
    }

    /** Call inside the diagnosis transaction; remove files after it commits. */
    public function markRevokedForDiagnosis(Diagnosis $diagnosis, User $actor, string $reason): array
    {
        $images = ResearchImage::query()->where('source_diagnosis_id', $diagnosis->id)
            ->whereNull('revoked_at')->lockForUpdate()->get();
        foreach ($images as $image) {
            $image->update(['revoked_at' => now(), 'revoked_by' => $actor->id, 'revocation_reason' => $reason]);
        }
        return $images->all();
    }
}
