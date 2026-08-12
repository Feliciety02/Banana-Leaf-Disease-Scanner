<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DatasetCandidateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'review_notes' => $this->review_notes,
            'reviewed_at' => $this->reviewed_at,
            'diagnosis' => new DiagnosisResource($this->whenLoaded('diagnosis')),
            'proposer' => $this->whenLoaded('proposer', fn () => $this->proposer?->only(['id', 'name'])),
            'reviewer' => $this->whenLoaded('reviewer', fn () => $this->reviewer?->only(['id', 'name'])),
        ];
    }
}
