<?php

namespace App\Http\Controllers\Expert;

use App\Contracts\Repositories\ResearchSourceRepositoryInterface;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResearchSourceController extends Controller
{
    public function __construct(private readonly ResearchSourceRepositoryInterface $sources) {}

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
}
