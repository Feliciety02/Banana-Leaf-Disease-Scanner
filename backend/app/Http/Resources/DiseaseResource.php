<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class DiseaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $isAdminView = ($request->user()?->isAdmin() && $request->is('api/admin/*'))
            || ($request->user()?->isAgriculturalExpert() && $request->is('api/expert/*'));
        $managementItems = collect();
        if ($this->relationLoaded('managementRecords')) {
            $managementItems = $isAdminView ? $this->managementRecords : $this->managementRecords->filter(function ($item) {
                if ($item->category !== 'chemical') {
                    return ! $item->regulatory_check_required || ($item->regulatory_checked_at && $item->regulatory_checked_at->gte(now()->subMonths(config('banana.regulatory_review_months'))));
                }

                return $item->relationLoaded('regulatoryChecks') && $item->regulatoryChecks->contains(
                    fn ($check) => $check->registration_status === 'registered' && $check->checked_at->gte(now()->subMonths(config('banana.regulatory_review_months'))) && (! $check->registration_expires_at || $check->registration_expires_at->isFuture())
                );
            })->values();
        }
        $farmerManagement = $managementItems->pluck('farmer_friendly_text')->filter()->implode("\n");
        $farmerPrevention = $managementItems->whereIn('category', ['prevention', 'sanitation', 'containment'])->pluck('farmer_friendly_text')->filter()->implode("\n");

        return [
            'id' => $this->id, 'slug' => $this->slug, 'name' => $this->name,
            'model_class_key' => $this->model_class_key, 'alternative_names' => $this->alternative_names ?? [],
            'scientific_name' => $this->scientific_name, 'causal_agent' => $this->causal_agent, 'pathogen_type' => $this->pathogen_type,
            'description' => $this->farmer_summary ?? $this->description, 'short_description' => $this->short_description,
            'curative_status' => $this->curative_status, 'verification_status' => $this->verification_status,
            'evidence_level' => $this->evidence_level, 'is_verified' => $this->is_verified,
            'last_reviewed_at' => $this->last_reviewed_at, 'regulatory_checked_at' => $this->regulatory_checked_at,
            'verified_at' => $this->verified_at, 'image_only_limitations' => $this->image_only_limitations,
            'professional_referral' => $this->professional_referral,
            'symptoms' => $this->whenLoaded('symptomRecords', fn () => $this->symptomRecords->where('visible_in_leaf_image', true)->pluck('farmer_friendly_text')->filter()->values(), $this->symptoms ?? []),
            'symptom_records' => $this->whenLoaded('symptomRecords'),
            'management_items' => $this->whenLoaded('managementRecords', fn () => $managementItems),
            'management' => $farmerManagement ?: $this->management, 'prevention' => $farmerPrevention ?: $this->prevention,
            'sources_count' => $this->whenCounted('evidence'),
            'verifications' => $this->whenLoaded('verifications'),
            'image_url' => $this->image_path ? Storage::disk('public')->url($this->image_path) : null,
        ];
    }
}
