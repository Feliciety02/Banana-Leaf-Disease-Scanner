<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ArticleRequest;
use App\Http\Resources\ArticleResource;
use App\Models\Article;
use App\Services\PrivateDiagnosisImageStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ArticleController extends Controller
{
    public function __construct(private readonly PrivateDiagnosisImageStorage $images) {}

    public function index(): JsonResponse
    {
        $articles = Article::query()->with('sources')->latest('updated_at')->get();

        return response()->json(['success' => true, 'message' => 'Articles retrieved.', 'data' => ArticleResource::collection($articles)->resolve()]);
    }

    public function store(ArticleRequest $request): JsonResponse
    {
        $article = DB::transaction(function () use ($request) {
            $article = Article::query()->create([
                ...$this->attributes($request),
                'slug' => $this->uniqueSlug($request->string('title')->toString()),
                'created_by' => $request->user()->id,
            ]);
            $this->syncSources($article, $request->validated('source_ids') ?? []);

            return $article;
        });

        return response()->json(['success' => true, 'message' => 'Article created.', 'data' => (new ArticleResource($article->load('sources')))->resolve()], 201);
    }

    public function update(ArticleRequest $request, Article $article): JsonResponse
    {
        DB::transaction(function () use ($request, $article) {
            $article->update($this->attributes($request, $article));
            $this->syncSources($article, $request->validated('source_ids') ?? []);
        });

        return response()->json(['success' => true, 'message' => 'Article updated.', 'data' => (new ArticleResource($article->refresh()->load('sources')))->resolve()]);
    }

    /**
     * Stores a photo for an article. Every upload is re-encoded as WebP (at
     * most 1600 px), which also strips metadata. The returned name goes into
     * the article's images list and a "[[image:<file>]]" line in the body.
     */
    public function uploadImage(Request $request): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240', 'dimensions:max_width=8000,max_height=8000'],
        ]);
        $path = $this->images->store($request->file('image'), Article::IMAGE_DIRECTORY, 1600, 'webp');
        $file = basename($path);

        return response()->json(['success' => true, 'message' => 'Photo uploaded.', 'data' => [
            'file' => $file,
            'url' => route('article-images.show', ['file' => $file], false),
        ]], 201);
    }

    public function destroy(Article $article): JsonResponse
    {
        $article->delete();

        return response()->json(status: 204);
    }

    private function attributes(ArticleRequest $request, ?Article $article = null): array
    {
        $data = $request->safe()->except('source_ids');
        $data['images'] = $this->checkedImages($data['images'] ?? [], $data['body']);
        $published = $data['status'] === Article::STATUS_PUBLISHED;

        return [
            ...$data,
            'disease_key' => $data['disease_key'] ?? null,
            // Keep the first publication date when an article is edited later.
            'published_at' => $published ? ($article?->published_at ?? now()) : null,
            'updated_by' => $request->user()->id,
        ];
    }

    /**
     * Every listed photo must exist, and every "[[image:...]]" line in the
     * body must point at a listed photo, so farmers never see a broken image.
     *
     * @param  array<int, array<string, string|null>>  $images
     */
    private function checkedImages(array $images, string $body): array
    {
        $files = array_column($images, 'file');
        foreach ($files as $index => $file) {
            if (! Storage::disk('local')->exists(Article::IMAGE_DIRECTORY.'/'.$file)) {
                throw ValidationException::withMessages(["images.{$index}.file" => 'This photo was not found. Upload it again.']);
            }
        }
        preg_match_all('/^\[\[image:([^\]]+)\]\]$/m', $body, $placed);
        foreach ($placed[1] as $file) {
            if (! in_array(trim($file), $files, true)) {
                throw ValidationException::withMessages(['body' => "The text places a photo ({$file}) that is not in the photo list."]);
            }
        }

        return array_values(array_map(fn (array $image) => array_intersect_key($image, array_flip(['file', 'caption', 'credit', 'license', 'license_url', 'source_url'])), $images));
    }

    /** @param  array<int, int>  $sourceIds */
    private function syncSources(Article $article, array $sourceIds): void
    {
        $article->sources()->sync(collect(array_values($sourceIds))
            ->mapWithKeys(fn (int $id, int $index) => [$id => ['sort_order' => $index]])
            ->all());
    }

    private function uniqueSlug(string $title): string
    {
        $base = Str::slug($title) ?: 'article';
        $slug = $base;
        for ($n = 2; Article::query()->where('slug', $slug)->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
