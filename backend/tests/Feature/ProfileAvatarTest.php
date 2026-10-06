<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProfileAvatarTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_uploads_replaces_and_removes_their_profile_photo(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create();
        Sanctum::actingAs($farmer);

        $first = $this->post('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('me.jpg', 900, 900)], ['Accept' => 'application/json'])
            ->assertOk()->json('data.user.avatar_url');
        $this->assertNotNull($first);
        $firstPath = $farmer->fresh()->avatar_path;
        Storage::disk('local')->assertExists($firstPath);
        $this->assertStringStartsWith('avatars/', $firstPath);
        $this->assertLessThanOrEqual(512, getimagesizefromstring(Storage::disk('local')->get($firstPath))[0]);

        $this->get($first)->assertOk();

        $this->post('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('me-2.png', 300, 300)], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('local')->assertMissing($firstPath);

        $secondPath = $farmer->fresh()->avatar_path;
        $this->deleteJson('/api/profile/avatar')->assertOk()->assertJsonPath('data.user.avatar_url', null);
        Storage::disk('local')->assertMissing($secondPath);
    }

    public function test_profile_photo_rejects_non_images(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->post('/api/profile/avatar', ['avatar' => UploadedFile::fake()->create('notes.pdf', 20, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('avatar');
    }

    public function test_only_the_owner_agriculturists_and_admins_can_view_a_profile_photo(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create();
        Sanctum::actingAs($farmer);
        $url = $this->post('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('me.jpg')], ['Accept' => 'application/json'])->json('data.user.avatar_url');

        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->get($url)->assertForbidden();

        Sanctum::actingAs(User::factory()->agriculturalExpert()->create());
        $this->get($url)->assertOk();

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->get($url)->assertOk();
    }

    public function test_deleting_the_account_removes_the_profile_photo(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create(['password' => 'Password123!']);
        Sanctum::actingAs($farmer);
        $this->post('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('me.jpg')], ['Accept' => 'application/json'])->assertOk();
        $path = $farmer->fresh()->avatar_path;

        $this->deleteJson('/api/profile', ['current_password' => 'Password123!'])->assertNoContent();
        Storage::disk('local')->assertMissing($path);
    }
}
