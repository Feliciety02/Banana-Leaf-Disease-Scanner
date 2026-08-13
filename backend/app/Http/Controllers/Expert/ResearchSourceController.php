<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Admin\ResearchSourceController as AdminResearchSourceController;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResearchSourceController extends Controller
{
    public function index(Request $request, AdminResearchSourceController $controller): JsonResponse
    {
        return $controller->index($request);
    }
}
