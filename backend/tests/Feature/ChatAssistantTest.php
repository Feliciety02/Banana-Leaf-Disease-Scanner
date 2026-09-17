<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChatAssistantTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.groq.key' => 'test-only-key',
            'services.groq.url' => 'https://api.groq.test/openai/v1',
            'services.groq.model' => 'openai/gpt-oss-20b',
            'services.groq.free_only' => true,
        ]);
    }

    public function test_chat_requires_an_authenticated_account(): void
    {
        Http::fake();

        $this->postJson('/api/chat', ['messages' => [
            ['role' => 'user', 'content' => 'What is Sigatoka?'],
        ]])->assertUnauthorized();

        Http::assertNothingSent();
    }

    public function test_chat_validates_a_small_user_ended_transcript(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());
        Http::fake();

        $this->postJson('/api/chat', ['messages' => [
            ['role' => 'user', 'content' => 'Hello'],
            ['role' => 'assistant', 'content' => 'Hello.'],
        ]])->assertUnprocessable()->assertJsonValidationErrors('messages');

        $this->postJson('/api/chat', ['messages' => array_fill(0, 9, [
            'role' => 'user', 'content' => 'Hello',
        ])])->assertUnprocessable()->assertJsonValidationErrors('messages');

        Http::assertNothingSent();
    }

    public function test_chat_sends_only_verified_knowledge_and_returns_the_reply(): void
    {
        $this->seed();
        Sanctum::actingAs(User::factory()->farmer()->create());
        Http::fake(['api.groq.test/*' => Http::response([
            'choices' => [['message' => ['content' => 'Monitor the leaf and ask an agriculturist if symptoms spread.']]],
        ])]);

        $this->postJson('/api/chat', ['messages' => [
            ['role' => 'user', 'content' => 'What should I do about spreading spots?'],
        ]])->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.reply', 'Monitor the leaf and ask an agriculturist if symptoms spread.')
            ->assertJsonStructure(['data' => ['reply', 'notice']]);

        Http::assertSent(function (Request $request): bool {
            $payload = $request->data();
            $knowledge = $payload['messages'][0]['content'] ?? '';

            return $request->url() === 'https://api.groq.test/openai/v1/chat/completions'
                && $request->hasHeader('Authorization', 'Bearer test-only-key')
                && $payload['model'] === 'openai/gpt-oss-20b'
                && $payload['max_completion_tokens'] === 280
                && str_contains($knowledge, 'Sigatoka Leaf Spot')
                && ! str_contains($knowledge, 'Panama disease support is being added');
        });
    }

    public function test_chat_stops_cleanly_when_the_free_quota_is_reached(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());
        Http::fake(['api.groq.test/*' => Http::response(['message' => 'rate limited'], 429)]);

        $this->postJson('/api/chat', ['messages' => [
            ['role' => 'user', 'content' => 'Help me understand this leaf.'],
        ]])->assertTooManyRequests()
            ->assertJsonPath('message', 'The free AI quota is busy or has been reached. Please try again later.');
    }

    public function test_chat_refuses_to_run_without_free_only_protection(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());
        config(['services.groq.free_only' => false]);
        Http::fake();

        $this->postJson('/api/chat', ['messages' => [
            ['role' => 'user', 'content' => 'Hello'],
        ]])->assertServiceUnavailable();

        Http::assertNothingSent();
    }
}
