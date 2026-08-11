<?php

namespace App\Http\Requests\Disease;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class UpsertDiseaseRequest extends ApiRequest
{
    public function rules(): array
    {
        $id = $this->route('disease')?->id ?? $this->route('disease');

        return [
            'slug' => ['required', 'string', 'max:100', Rule::unique('diseases')->ignore($id)],
            'name' => ['required', 'string', 'max:255'],
            'scientific_name' => ['nullable', 'string', 'max:255'],
            'description' => ['required', 'string'],
            'symptoms' => ['required', 'array', 'min:1'],
            'symptoms.*' => ['required', 'string', 'max:500'],
            'management' => ['required', 'string'],
            'prevention' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ];
    }
}
