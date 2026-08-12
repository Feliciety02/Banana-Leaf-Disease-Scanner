<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DiagnosisReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'review_status' => $this->review_status,
            'verified_label' => $this->verified_label,
            'image_quality' => $this->image_quality,
            'next_steps' => $this->next_steps ?? [],
            'notes' => $this->when($request->user()?->isAdmin() || $request->user()?->isAgriculturalExpert(), $this->notes),
            'requires_field_inspection' => $this->requires_field_inspection,
            'requested_at' => $this->requested_at,
            'reviewed_at' => $this->reviewed_at,
            'reviewer' => $this->whenLoaded('expert', fn () => $this->expert?->only(['id', 'name'])),
            'farmer_follow_up' => $this->farmerFollowUp(),
        ];
    }

    private function farmerFollowUp(): string
    {
        return match ($this->review_status) {
            'confirmed' => 'Continue monitoring the plant and follow only verified disease guidance.',
            'alternate_class' => 'Review the agricultural assessment and the verified guide for the supported class.',
            'cannot_determine' => 'Retake clear photos and contact your local agriculture office if symptoms continue.',
            'field_or_laboratory_required' => 'Arrange field or laboratory examination through a qualified plant-health service.',
            'possible_outside_supported_classes' => 'The condition may be outside the classes supported by this app. Seek an in-person plant-health assessment.',
            default => 'The review is pending.',
        };
    }
}
