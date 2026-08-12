<?php

namespace App\Http\Requests;

use Illuminate\Validation\Rule;

class ResearchSourceRequest extends ApiRequest
{
    public function rules(): array
    {
        $id = $this->route('source')?->id ?? $this->route('source');

        return [
            'title' => ['required', 'string', 'max:2000'],
            'authors' => ['required', 'string', 'max:2000'],
            'year' => ['nullable', 'integer', 'between:1800,'.now()->year],
            'journal_or_institution' => ['required', 'string', 'max:255'],
            'source_type' => ['required', Rule::in(['peer_reviewed_article', 'systematic_review', 'review_article', 'government_guideline', 'FAO_guideline', 'university_extension', 'regulatory_document', 'academic_book_chapter', 'research_institute'])],
            'volume' => ['nullable', 'string', 'max:100'],
            'issue' => ['nullable', 'string', 'max:100'],
            'pages' => ['nullable', 'string', 'max:100'],
            'doi' => ['nullable', 'string', 'max:255', Rule::unique('research_sources')->ignore($id)],
            'reference_url' => ['nullable', 'url', 'max:2000'],
            'country_or_region' => ['nullable', 'string', 'max:255'],
            'peer_reviewed' => ['required', 'boolean'],
            'philippines_specific' => ['required', 'boolean'],
            'publication_date' => ['nullable', 'date'],
            'accessed_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
