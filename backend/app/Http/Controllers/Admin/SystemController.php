<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\SystemInformationService;
use Illuminate\Http\JsonResponse;

class SystemController extends Controller
{
    public function __construct(private readonly SystemInformationService $system) {}

    public function show(): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'System information retrieved.', 'data' => $this->system->information()]);
    }
}
