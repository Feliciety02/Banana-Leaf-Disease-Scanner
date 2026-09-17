<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class ChatRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'messages' => ['required', 'array', 'min:1', 'max:8'],
            'messages.*' => ['required', 'array:role,content'],
            'messages.*.role' => ['required', Rule::in(['user', 'assistant'])],
            'messages.*.content' => ['required', 'string', 'min:1', 'max:800'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $messages = $this->input('messages');
            $lastMessage = is_array($messages) ? end($messages) : null;

            if (is_array($lastMessage) && ($lastMessage['role'] ?? null) !== 'user') {
                $validator->errors()->add('messages', 'The final chat message must come from the user.');
            }
        });
    }
}
