<?php

namespace App\Http\Controllers;

use App\Http\Resources\ArticleResource;
use App\Models\Article;
use Illuminate\Http\JsonResponse;

class ArticleController extends Controller
{
    /**
     * Every published article with its references. The library is small, so
     * the app downloads all of it at once and keeps it for offline reading.
     */
    public function index(): JsonResponse
    {
        $articles = Article::query()->published()->with('sources')->orderBy('disease_key')->orderBy('title')->get();

        return response()->json([
            'success' => true,
            'message' => 'Articles retrieved.',
            'data' => ArticleResource::collection($articles)->resolve(),
        ]);
    }
}
