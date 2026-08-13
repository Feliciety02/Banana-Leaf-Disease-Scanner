<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),
            'diagnoses_count' => $this->whenCounted('diagnoses'),
            'last_activity_at' => $this->when(isset($this->diagnoses_max_diagnosed_at), $this->diagnoses_max_diagnosed_at),
            'created_at' => $this->created_at,
        ];
    }
}
