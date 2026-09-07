<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;

class UpdateProfileRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($this->user()->id)],
            'current_password' => [
                Rule::requiredIf(fn () => $this->filled('email')
                    && Str::lower($this->string('email')->toString()) !== Str::lower($this->user()->email)),
                'nullable',
                'current_password',
            ],
        ];
    }
}
