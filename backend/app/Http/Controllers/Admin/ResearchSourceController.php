<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ResearchSourceRequest;
use App\Models\ResearchSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ResearchSourceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ResearchSource::query()->with(['evidence.disease:id,name'])->withCount('evidence')->latest('year');
        $query->when($request->filled('search'), fn ($q) => $q->where(fn ($nested) => $nested->where('title', 'like', '%'.$request->string('search').'%')->orWhere('authors', 'like', '%'.$request->string('search').'%')->orWhere('journal_or_institution', 'like', '%'.$request->string('search').'%')))
            ->when($request->boolean('peer_reviewed'), fn ($q) => $q->where('peer_reviewed', true))
            ->when($request->boolean('philippines_specific'), fn ($q) => $q->where('philippines_specific', true))
            ->when($request->filled('institution'), fn ($q) => $q->where('journal_or_institution', 'like', '%'.$request->string('institution').'%'))
            ->when($request->filled('disease_id'), fn ($q) => $q->whereHas('evidence', fn ($evidence) => $evidence->where('disease_id', $request->integer('disease_id'))));

        return response()->json(['success' => true, 'message' => 'Research sources retrieved.', 'data' => $query->get()]);
    }

    public function store(ResearchSourceRequest $request): JsonResponse
    {
        $source = ResearchSource::query()->create([...$request->validated(), 'created_by' => $request->user()->id]);

        return response()->json(['success' => true, 'message' => 'Research source created.', 'data' => $source], 201);
    }

    public function update(ResearchSourceRequest $request, ResearchSource $source): JsonResponse
    {
        $source->load('evidence.disease');
        $source->update($request->validated());
        foreach ($source->evidence->pluck('disease')->filter()->unique('id') as $disease) {
            if ($disease->is_verified) {
                $disease->update(['verification_status' => 'researched', 'is_verified' => false, 'verified_at' => null, 'verified_by' => null]);
            }
        }

        return response()->json(['success' => true, 'message' => 'Source updated; affected verified content was returned for review.', 'data' => $source->fresh()]);
    }

    public function destroy(ResearchSource $source): JsonResponse
    {
        if ($source->evidence()->exists()) {
            throw ValidationException::withMessages(['source' => 'A source mapped to claims cannot be deleted. Remove or replace its evidence mappings first.']);
        }
        $source->delete();

        return response()->json(status: 204);
    }
}
