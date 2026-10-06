<?php

namespace App\Http\Requests;

use App\Models\Article;
use Illuminate\Validation\Rule;

class ArticleRequest extends ApiRequest
{
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'disease_key' => ['nullable', Rule::in(Article::DISEASE_KEYS)],
            'topic' => ['required', Rule::in(Article::TOPICS)],
            'language' => ['required', Rule::in(['en', 'fil'])],
            'summary' => ['required', 'string', 'max:1000'],
            'body' => ['required', 'string', 'max:30000'],
            'authors' => ['required', 'string', 'max:500'],
            'status' => ['required', Rule::in([Article::STATUS_DRAFT, Article::STATUS_PUBLISHED])],
            // A published article must cite at least one research source.
            'source_ids' => [Rule::requiredIf($this->input('status') === Article::STATUS_PUBLISHED), 'array', 'max:20'],
            'source_ids.*' => ['integer', 'distinct', 'exists:research_sources,id'],
            // Photos uploaded through /admin/article-images, each credited with its license.
            'images' => ['nullable', 'array', 'max:10'],
            'images.*.file' => ['required', 'string', 'distinct', 'regex:'.Article::IMAGE_FILE_PATTERN],
            'images.*.caption' => ['required', 'string', 'max:300'],
            'images.*.credit' => ['required', 'string', 'max:300'],
            'images.*.license' => ['required', 'string', 'max:100'],
            'images.*.license_url' => ['nullable', 'url', 'max:500'],
            'images.*.source_url' => ['nullable', 'url', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'source_ids.required' => 'Add at least one reference before publishing.',
            'images.*.credit.required' => 'Every photo needs a credit (who took it or where it came from).',
            'images.*.license.required' => 'Every photo needs its license, for example CC0 or CC BY 4.0.',
        ];
    }
}
