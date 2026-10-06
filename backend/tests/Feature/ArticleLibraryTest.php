<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\ResearchSource;
use App\Models\User;
use Database\Seeders\ArticleLibrarySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ArticleLibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_manages_articles_and_only_published_ones_are_public(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $source = ResearchSource::query()->create([
            'title' => 'Test-only source', 'authors' => 'Fixture Author', 'journal_or_institution' => 'Fixture Institute',
            'source_type' => 'research_institute', 'reference_url' => 'https://example.org/fixture', 'peer_reviewed' => false, 'philippines_specific' => false,
        ]);
        $payload = [
            'title' => 'Fixture article', 'disease_key' => 'sigatoka', 'topic' => 'field_care', 'language' => 'en',
            'summary' => 'Test-only summary.', 'body' => "## Heading\nTest-only body.", 'authors' => 'Fixture Writer', 'status' => 'draft',
        ];

        $draft = $this->postJson('/api/admin/articles', $payload)->assertCreated()->json('data');
        $this->assertSame('fixture-article', $draft['slug']);
        $this->assertNull($draft['published_at']);
        $this->getJson('/api/articles')->assertOk()->assertJsonCount(0, 'data');

        // Publishing requires a reference.
        $this->putJson("/api/admin/articles/{$draft['id']}", [...$payload, 'status' => 'published'])
            ->assertUnprocessable()->assertJsonValidationErrors('source_ids');

        $published = $this->putJson("/api/admin/articles/{$draft['id']}", [...$payload, 'status' => 'published', 'source_ids' => [$source->id]])
            ->assertOk()->json('data');
        $this->assertNotNull($published['published_at']);

        $this->postJson('/api/admin/articles', $payload)->assertCreated()->assertJsonPath('data.slug', 'fixture-article-2');

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/articles')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Fixture article')
            ->assertJsonPath('data.0.references.0.title', 'Test-only source')
            ->assertJsonPath('data.0.references.0.reference_url', 'https://example.org/fixture');
        $this->getJson('/api/admin/articles')->assertForbidden();
        $this->postJson('/api/admin/articles', $payload)->assertForbidden();

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->deleteJson("/api/admin/articles/{$draft['id']}")->assertNoContent();
        $this->assertDatabaseMissing('article_research_source', ['article_id' => $draft['id']]);
    }

    public function test_library_is_readable_without_signing_in(): void
    {
        $this->seed(ArticleLibrarySeeder::class);

        $articles = $this->getJson('/api/articles')->assertOk()->json('data');
        $this->assertCount(12, $articles);
        foreach ($articles as $article) {
            $this->assertNotEmpty($article['references'], "{$article['slug']} has no references");
            foreach ($article['references'] as $reference) {
                $this->assertNotEmpty($reference['reference_url']);
            }
        }
        foreach (Article::DISEASE_KEYS as $key) {
            $this->assertNotEmpty(array_filter($articles, fn ($a) => $a['disease_key'] === $key), "No article for {$key}");
        }
    }

    public function test_seeding_again_keeps_admin_edits_and_existing_sources(): void
    {
        $this->seed(ArticleLibrarySeeder::class);
        $sourceCount = ResearchSource::query()->count();
        $article = Article::query()->where('slug', 'gap-package')->firstOrFail();
        $article->update(['title' => 'Edited by admin', 'updated_by' => User::factory()->admin()->create()->id]);

        $this->seed(ArticleLibrarySeeder::class);

        $this->assertSame('Edited by admin', $article->refresh()->title);
        $this->assertSame($sourceCount, ResearchSource::query()->count());
    }

    public function test_seeded_article_photos_are_served_publicly_as_webp(): void
    {
        Storage::fake('local');
        $this->seed(ArticleLibrarySeeder::class);

        $articles = collect($this->getJson('/api/articles')->assertOk()->json('data'));
        $withPhotos = $articles->filter(fn ($article) => count($article['images']) > 0);
        $this->assertGreaterThanOrEqual(5, $withPhotos->count());
        foreach ($withPhotos as $article) {
            foreach ($article['images'] as $image) {
                $this->assertStringEndsWith('.webp', $image['file']);
                $this->assertNotEmpty($image['credit']);
                $this->assertNotEmpty($image['license']);
                $this->assertStringContainsString("[[image:{$image['file']}]]", $article['body']);
                $this->assertSame('/api/article-images/'.$image['file'], $image['url']);
            }
        }

        $file = $withPhotos->first()['images'][0]['file'];
        $response = $this->get("/api/article-images/{$file}")->assertOk();
        $this->assertSame('image/webp', $response->headers->get('Content-Type'));
        $this->get('/api/article-images/missing-photo.webp')->assertNotFound();
        $this->get('/api/article-images/..%2F..%2F.env')->assertNotFound();
        $this->get('/api/article-images/photo.png')->assertNotFound();
    }

    public function test_admin_photo_uploads_become_webp_and_must_be_credited(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->admin()->create());
        $source = ResearchSource::query()->create([
            'title' => 'Test-only source', 'authors' => 'Fixture Author', 'journal_or_institution' => 'Fixture Institute',
            'source_type' => 'research_institute', 'reference_url' => 'https://example.org/fixture', 'peer_reviewed' => false, 'philippines_specific' => false,
        ]);

        $uploaded = $this->post('/api/admin/article-images', ['image' => UploadedFile::fake()->image('field.jpg', 2400, 1800)], ['Accept' => 'application/json'])
            ->assertCreated()->json('data');
        $this->assertMatchesRegularExpression(Article::IMAGE_FILE_PATTERN, $uploaded['file']);
        $stored = Storage::disk('local')->get(Article::IMAGE_DIRECTORY.'/'.$uploaded['file']);
        $this->assertSame('RIFF', substr($stored, 0, 4));
        $this->assertSame('WEBP', substr($stored, 8, 4));
        [$width, $height] = getimagesizefromstring($stored);
        $this->assertSame([1600, 1200], [$width, $height]);

        $payload = [
            'title' => 'Photo article', 'disease_key' => 'sigatoka', 'topic' => 'field_care', 'language' => 'en',
            'summary' => 'Summary.', 'body' => "[[image:{$uploaded['file']}]]\nText.", 'authors' => 'Writer', 'status' => 'published',
            'source_ids' => [$source->id],
        ];
        // The body places a photo that is not in the list.
        $this->postJson('/api/admin/articles', $payload)->assertUnprocessable()->assertJsonValidationErrors('body');
        // A listed photo needs its credit and license.
        $this->postJson('/api/admin/articles', [...$payload, 'images' => [['file' => $uploaded['file'], 'caption' => 'A leaf']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['images.0.credit', 'images.0.license']);
        // A photo that was never uploaded is refused.
        $this->postJson('/api/admin/articles', [...$payload, 'body' => 'Text.', 'images' => [['file' => 'never-uploaded.webp', 'caption' => 'x', 'credit' => 'x', 'license' => 'CC0']]])
            ->assertUnprocessable()->assertJsonValidationErrors('images.0.file');

        $article = $this->postJson('/api/admin/articles', [...$payload, 'images' => [['file' => $uploaded['file'], 'caption' => 'A leaf', 'credit' => 'Farmer Juan', 'license' => 'CC BY 4.0', 'license_url' => 'https://creativecommons.org/licenses/by/4.0/']]])
            ->assertCreated()->json('data');
        $this->assertSame('Farmer Juan', $article['images'][0]['credit']);
        $this->getJson('/api/articles')->assertOk()->assertJsonPath('data.0.images.0.file', $uploaded['file']);

        Sanctum::actingAs(User::factory()->create());
        $this->post('/api/admin/article-images', ['image' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_profile_photos_are_stored_as_webp(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->create();
        Sanctum::actingAs($farmer);

        $this->post('/api/profile/avatar', ['avatar' => UploadedFile::fake()->image('me.jpg', 900, 900)], ['Accept' => 'application/json'])->assertOk();

        $path = $farmer->fresh()->avatar_path;
        $this->assertStringEndsWith('.webp', $path);
        $this->assertSame('WEBP', substr(Storage::disk('local')->get($path), 8, 4));
    }
}
