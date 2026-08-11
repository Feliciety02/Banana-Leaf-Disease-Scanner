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
            'predicted_class' => ['required', 'string', 'max:100'],
            'confidence' => ['required', 'numeric', 'between:0,100'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'model_version' => ['nullable', 'string', 'max:100'],
            'inference_time_ms' => ['nullable', 'integer', 'min:0'],
            'source' => ['required', Rule::in(['web', 'mobile'])],
            'sync_uuid' => ['nullable', 'uuid', 'unique:diagnoses,sync_uuid'],
            'diagnosed_at' => ['required', 'date'],
        ];
    }
}
