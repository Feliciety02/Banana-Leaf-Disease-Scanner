<?php

namespace App\Http\Controllers;

use App\Http\Requests\ChatRequest;
use App\Services\GroqChatService;
use Illuminate\Http\JsonResponse;

class ChatController extends Controller
{
    public function __construct(private readonly GroqChatService $chat) {}

    public function __invoke(ChatRequest $request): JsonResponse
    {
        $result = $this->chat->reply($request->validated('messages'));

        return response()->json($result['body'], $result['status']);
    }
}
