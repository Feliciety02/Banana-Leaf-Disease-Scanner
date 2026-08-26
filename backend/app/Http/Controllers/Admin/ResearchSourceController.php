<?php

namespace App\Http\Controllers\Admin;

use App\Contracts\Repositories\ResearchSourceRepositoryInterface;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResearchSourceRequest;
use App\Models\ResearchSource;
use App\Services\ResearchSourceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResearchSourceController extends Controller
{
    public function __construct(
        private readonly ResearchSourceRepositoryInterface $sources,
        private readonly ResearchSourceService $sourceService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = [
            'peer_reviewed' => $request->boolean('peer_reviewed'),
            'philippines_specific' => $request->boolean('philippines_specific'),
        ];
        foreach (['search', 'institution', 'disease_id'] as $filter) {
            if ($request->filled($filter)) {
                $filters[$filter] = $filter === 'disease_id'
                    ? $request->integer($filter)
                    : $request->string($filter)->toString();
            }
        }

        return response()->json(['success' => true, 'message' => 'Research sources retrieved.', 'data' => $this->sources->all($filters)]);
    }

    public function store(ResearchSourceRequest $request): JsonResponse
    {
        $source = $this->sourceService->create($request->validated(), $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Research source created.', 'data' => $source], 201);
    }

    public function update(ResearchSourceRequest $request, ResearchSource $source): JsonResponse
    {
        $source = $this->sourceService->update($source, $request->validated());

        return response()->json(['success' => true, 'message' => 'Source updated; affected verified content was returned for review.', 'data' => $source]);
    }

    public function destroy(ResearchSource $source): JsonResponse
    {
        $this->sourceService->delete($source);

        return response()->json(status: 204);
    }
}
