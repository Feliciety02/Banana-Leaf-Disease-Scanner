<?php

namespace App\Http\Requests\Diagnosis;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class StoreDiagnosisRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'disease_id' => ['nullable', 'integer', 'exists:diseases,id'],
            'predicted_class' => ['required', 'string', 'max:100', Rule::in(config('banana.class_labels', []))],
            'confidence' => ['required', 'numeric', 'between:0,100'],
            'image' => [Rule::requiredIf(fn () => $this->boolean('research_consent')), 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'farmer_notes' => ['nullable', 'string', 'max:1000'],
            'research_consent' => ['sometimes', 'boolean'],
            'model_version' => ['nullable', 'string', 'max:100'],
            'inference_time_ms' => ['nullable', 'integer', 'min:0'],
            'source' => ['required', Rule::in(['web', 'mobile'])],
            'sync_uuid' => ['nullable', 'uuid', 'unique:diagnoses,sync_uuid'],
            'diagnosed_at' => ['required', 'date'],
        ];
    }
}
