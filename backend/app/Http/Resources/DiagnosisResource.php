<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

class DiagnosisResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'user' => new UserResource($this->whenLoaded('user')),
            'disease' => new DiseaseResource($this->whenLoaded('disease')),
            'predicted_class' => $this->predicted_class, 'confidence' => $this->confidence,
            'image_url' => $this->mediaUrl($request, 'image', $this->image_path),
            'image_version' => $this->image_path ? hash('sha256', $this->image_path) : null,
            'gradcam_url' => $this->mediaUrl($request, 'gradcam', $this->gradcam_path),
            'farmer_notes' => $this->farmer_notes,
            // Only present when the farmer chose to attach a location to this scan.
            'location' => $this->latitude !== null && $this->longitude !== null ? ['latitude' => $this->latitude, 'longitude' => $this->longitude] : null,
            'research_consent' => $this->hasActiveResearchConsent(),
            'research_consent_current' => $this->hasCurrentResearchConsent(),
            'research_consented_at' => $this->research_consented_at,
            'research_consent_version' => $this->research_consent_version,
            'research_consent_withdrawn_at' => $this->research_consent_withdrawn_at,
            'model_version' => $this->model_version, 'inference_time_ms' => $this->inference_time_ms,
            'source' => $this->source, 'is_simulated' => $this->is_simulated, 'prediction_verified' => $this->prediction_verified, 'sync_uuid' => $this->sync_uuid, 'sync_status' => $this->sync_status,
            'class_probabilities' => $this->class_probabilities, 'model_comparison' => $this->model_comparison,
            'diagnosed_at' => $this->diagnosed_at, 'created_at' => $this->created_at,
            'review' => new DiagnosisReviewResource($this->whenLoaded('review')),
            // Which agriculturist holds the case is for staff; farmers only learn that someone is on it.
            'review_claim' => $this->when(
                $this->relationLoaded('reviewClaim') && $this->reviewClaim?->isActive()
                    && ($request->user()?->isAdmin() || $request->user()?->isAgriculturalExpert()),
                fn () => ['user' => $this->reviewClaim->user?->only(['id', 'name']), 'expires_at' => $this->reviewClaim->expires_at->toIso8601String()],
            ),
            'review_in_progress_until' => $this->relationLoaded('reviewClaim') && $this->reviewClaim?->isActive()
                ? $this->reviewClaim->expires_at->toIso8601String() : null,
            'review_priority' => $this->when($this->review_priority !== null, $this->review_priority),
            'review_reasons' => $this->when($this->review_reasons !== null, $this->review_reasons),
        ];
    }

    /**
     * Signed for the requesting user so a plain <img> can load the private
     * photo; DiagnosisMediaController still applies the view policy.
     */
    private function mediaUrl(Request $request, string $kind, ?string $path): ?string
    {
        if (! $path) {
            return null;
        }
        $parameters = ['diagnosis' => $this->id, 'kind' => $kind];
        $viewer = $request->user();
        if (! $viewer) {
            return route('diagnosis-media.show', $parameters, absolute: false);
        }

        return URL::temporarySignedRoute(
            'diagnosis-media.show',
            now()->addMinutes(config('banana.media_url_ttl_minutes')),
            [...$parameters, 'viewer' => $viewer->getAuthIdentifier()],
            absolute: false,
        );
    }
}
