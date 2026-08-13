<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityReliabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_includes_database_check_and_request_id(): void
    {
        $response = $this->withHeader('X-Request-ID', 'health-check-123')->getJson('/api/health');

        $response->assertOk()
            ->assertHeader('X-Request-ID', 'health-check-123')
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('checks.database', 'ok');
    }

    public function test_invalid_request_id_is_replaced(): void
    {
        $response = $this->withHeader('X-Request-ID', "invalid\nvalue")->getJson('/api/health');

        $response->assertOk();
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', (string) $response->headers->get('X-Request-ID'));
    }

    public function test_login_is_rate_limited(): void
    {
        User::factory()->create(['email' => 'rate-limit@example.test']);

        for ($attempt = 1; $attempt <= 10; $attempt++) {
            $this->postJson('/api/auth/login', [
                'email' => 'rate-limit@example.test',
                'password' => 'incorrect-password',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', [
            'email' => 'rate-limit@example.test',
            'password' => 'incorrect-password',
        ])->assertTooManyRequests();
    }

    public function test_password_reset_is_generic_and_revokes_existing_tokens(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'reset@example.test', 'password' => 'old-password']);
        $user->createToken('existing-device');

        $this->postJson('/api/auth/forgot-password', ['email' => 'missing@example.test'])
            ->assertOk()
            ->assertJsonPath('success', true);
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertOk()
            ->assertJsonPath('success', true);
        Notification::assertSentTo($user, ResetPasswordNotification::class);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'token' => Password::createToken($user),
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-password-123', $user->fresh()->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_public_account_deletion_requires_credentials_and_deletes_account(): void
    {
        $user = User::factory()->create(['email' => 'delete@example.test', 'password' => 'correct-password']);
        $user->createToken('mobile');

        $this->get('/privacy')->assertOk()->assertSee('DahonMD privacy policy');
        $this->get('/account-deletion')->assertOk()->assertSee('Permanently delete account');
        $this->from('/account-deletion')->post('/account-deletion', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertRedirect('/account-deletion')->assertSessionHasErrors('email');
        $this->assertDatabaseHas('users', ['id' => $user->id]);

        $this->from('/account-deletion')->post('/account-deletion', [
            'email' => $user->email,
            'password' => 'correct-password',
        ])->assertRedirect('/account-deletion')->assertSessionHas('status');
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_signed_email_verification_link_marks_the_account_verified(): void
    {
        $user = User::factory()->unverified()->create();
        $verificationUrl = URL::temporarySignedRoute('verification.verify', now()->addMinutes(30), [
            'id' => $user->id,
            'hash' => sha1($user->getEmailForVerification()),
        ]);

        $this->get($verificationUrl)->assertOk()->assertSee('Email verified');
        $this->assertTrue($user->fresh()->hasVerifiedEmail());
    }

    public function test_changing_email_requires_verification_again(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'before@example.test']);
        Sanctum::actingAs($user);

        $this->putJson('/api/profile', [
            'name' => $user->name,
            'email' => 'after@example.test',
        ])->assertOk()->assertJsonPath('data.user.email_verified_at', null);

        $this->assertNull($user->fresh()->email_verified_at);
        Notification::assertSentTo($user, VerifyEmail::class);
    }
}
