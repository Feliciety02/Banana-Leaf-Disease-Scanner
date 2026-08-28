<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\ApiRequest;
use App\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UpdateUserRequest extends ApiRequest
{
    public function rules(): array
    {
        $id = $this->route('user')?->id ?? $this->route('user');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users')->ignore($id)],
            'role' => ['sometimes', 'required', Rule::in(User::ROLES)],
            'password' => ['nullable', 'confirmed', Password::min(8)],
        ];
    }
}
