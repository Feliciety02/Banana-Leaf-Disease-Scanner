<?php

namespace App\Http\Requests\Disease;

use App\Http\Requests\ApiRequest;
use App\Support\ClassLabelRegistry;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpsertDiseaseRequest extends ApiRequest
{
    public function rules(): array
    {
        $id = $this->route('disease')?->id ?? $this->route('disease');

        return [
            'slug' => ['required', 'string', 'max:100', Rule::unique('diseases')->ignore($id)],
            'model_class_key' => ['required', 'string', 'max:100', Rule::unique('diseases')->ignore($id)],
            'name' => ['required', 'string', 'max:255'],
            'alternative_names' => ['nullable', 'array'],
            'alternative_names.*' => ['string', 'max:255'],
            'scientific_name' => ['nullable', 'string', 'max:255'],
            'causal_agent' => ['nullable', 'string', 'max:255'],
            'pathogen_type' => ['nullable', Rule::in(['fungus', 'bacterium', 'virus', 'other'])],
            'short_description' => ['nullable', 'string'],
            'farmer_summary' => ['nullable', 'string'],
            'curative_status' => ['required', Rule::in(['curative_treatment_available', 'manageable_not_curable', 'no_known_cure', 'unclear_evidence'])],
            'evidence_level' => ['required', Rule::in(['high', 'moderate', 'limited'])],
            'image_only_limitations' => ['nullable', 'string'],
            'professional_referral' => ['nullable', 'string'],
            'prevention' => ['nullable', 'string'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            $registry = app(ClassLabelRegistry::class);
            if (! $registry->isEstablished()) {
                $validator->errors()->add('model_class_key', 'DISEASE CONTENT PENDING — final dataset class labels have not yet been established.');

                return;
            }
            if (! in_array($this->string('model_class_key')->toString(), $registry->labels(), true)) {
                $validator->errors()->add('model_class_key', 'The class key is not present in the validated five-class label map.');
            }
        }];
    }
}
