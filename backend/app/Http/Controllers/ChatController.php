<?php

namespace App\Http\Controllers;

use App\Http\Requests\ChatRequest;
use App\Models\Diagnosis;
use App\Services\GroqChatService;
use Illuminate\Http\JsonResponse;

class ChatController extends Controller
{
    public function __construct(private readonly GroqChatService $chat) {}

    public function __invoke(ChatRequest $request): JsonResponse
    {
        $diagnosis = null;
        if ($request->validated('diagnosis_id')) {
            // Only the farmer's own scan may be shared with the assistant.
            $diagnosis = Diagnosis::query()->with(['disease', 'review'])
                ->whereKey($request->validated('diagnosis_id'))
                ->where('user_id', $request->user()->id)
                ->firstOrFail();
        }
        $result = $this->chat->reply($request->validated('messages'), $diagnosis);

        return response()->json($result['body'], $result['status']);
    }
}
