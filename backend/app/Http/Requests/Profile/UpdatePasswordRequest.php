<?php

namespace App\Http\Requests\Profile;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rules\Password;

class UpdatePasswordRequest extends ApiRequest
{
    public function rules(): array
    {
        return ['current_password' => ['required', 'current_password'], 'password' => ['required', 'confirmed', Password::min(8)]];
    }
}
