<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Article */
class ArticleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'title' => $this->title,
            'disease_key' => $this->disease_key,
            'topic' => $this->topic,
            'language' => $this->language,
            'summary' => $this->summary,
            'body' => $this->body,
            'images' => collect($this->images ?? [])->map(fn (array $image) => [
                ...$image,
                // Relative, so the phone and the website resolve it against the server they use.
                'url' => route('article-images.show', ['file' => $image['file']], false),
            ])->values(),
            'authors' => $this->authors,
            'status' => $this->status,
            'reading_minutes' => $this->readingMinutes(),
            'published_at' => $this->published_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'references' => $this->whenLoaded('sources', fn () => $this->sources->map(fn ($source) => [
                'id' => $source->id,
                'title' => $source->title,
                'authors' => $source->authors,
                'year' => $source->year,
                'journal_or_institution' => $source->journal_or_institution,
                'source_type' => $source->source_type,
                'doi' => $source->doi,
                'reference_url' => $source->reference_url,
                'peer_reviewed' => (bool) $source->peer_reviewed,
                'philippines_specific' => (bool) $source->philippines_specific,
            ])->values()),
        ];
    }
}
