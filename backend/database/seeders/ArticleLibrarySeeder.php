<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\ResearchSource;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Seeds the farmer article library from database/data/library-articles.json,
 * the same file the mobile app bundles for offline reading. Every reference
 * in that file was checked against the published source.
 */
class ArticleLibrarySeeder extends Seeder
{
    public function run(): void
    {
        $data = json_decode((string) file_get_contents(database_path('data/library-articles.json')), true, flags: JSON_THROW_ON_ERROR);
        $accessedAt = CarbonImmutable::parse('2026-10-05 00:00:00', 'Asia/Manila');

        $sources = [];
        foreach ($data['sources'] as $key => $definition) {
            $identity = $definition['doi'] ? ['doi' => $definition['doi']] : ['reference_url' => $definition['reference_url']];
            $source = ResearchSource::query()->where($identity)->first();
            // Existing sources may have been corrected by an admin; only add missing ones.
            $sources[$key] = $source ?? ResearchSource::query()->create([...$definition, 'accessed_at' => $accessedAt, 'created_by' => null]);
        }

        // Article photos (WebP, credited in the JSON) are served from local storage.
        foreach (File::files(database_path('data/library-images')) as $image) {
            $target = Article::IMAGE_DIRECTORY.'/'.$image->getFilename();
            if (! Storage::disk('local')->exists($target)) {
                Storage::disk('local')->put($target, File::get($image->getPathname()));
            }
        }

        // Production starts as drafts so an admin reviews the library before farmers see it.
        $status = app()->environment('production') ? Article::STATUS_DRAFT : Article::STATUS_PUBLISHED;

        foreach ($data['articles'] as $item) {
            $article = Article::query()->where('slug', $item['slug'])->first();
            if ($article?->updated_by !== null) {
                $this->command?->info("Kept the admin-edited article {$item['slug']}.");

                continue;
            }

            $article ??= new Article(['slug' => $item['slug']]);
            $article->fill([
                'title' => $item['title'],
                'disease_key' => $item['disease'],
                'topic' => $item['topic'],
                'language' => $item['language'] ?? 'en',
                'summary' => $item['summary'],
                'body' => $item['body'],
                'images' => $item['images'] ?? [],
                'authors' => $item['authors'],
                'status' => $status,
                'published_at' => $status === Article::STATUS_PUBLISHED ? CarbonImmutable::parse($item['published_at'], 'Asia/Manila') : null,
            ])->save();

            $order = [];
            foreach ($item['references'] as $index => $key) {
                if (! isset($sources[$key])) {
                    throw new RuntimeException("Article {$item['slug']} cites unknown source {$key}.");
                }
                $order[$sources[$key]->id] = ['sort_order' => $index];
            }
            $article->sources()->sync($order);
        }
    }
}
