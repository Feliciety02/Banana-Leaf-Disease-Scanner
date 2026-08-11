<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class DiagnosisResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'user' => new UserResource($this->whenLoaded('user')),
            'disease' => new DiseaseResource($this->whenLoaded('disease')),
            'predicted_class' => $this->predicted_class, 'confidence' => $this->confidence,
            'image_url' => $this->image_path ? Storage::disk('public')->url($this->image_path) : null,
            'gradcam_url' => $this->gradcam_path ? Storage::disk('public')->url($this->gradcam_path) : null,
            'model_version' => $this->model_version, 'inference_time_ms' => $this->inference_time_ms,
            'source' => $this->source, 'sync_uuid' => $this->sync_uuid, 'sync_status' => $this->sync_status,
            'diagnosed_at' => $this->diagnosed_at, 'created_at' => $this->created_at,
        ];
    }
}
