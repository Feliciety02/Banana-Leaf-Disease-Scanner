<?php

namespace App\Http\Controllers;

use App\Models\Article;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ArticleImageController extends Controller
{
    /** Library photos are public like the articles, so the app can save them for offline reading. */
    public function __invoke(string $file): BinaryFileResponse
    {
        abort_unless(preg_match(Article::IMAGE_FILE_PATTERN, $file) === 1, 404);
        $path = Article::IMAGE_DIRECTORY.'/'.$file;
        abort_unless(Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), [
            'Content-Type' => 'image/webp',
            'Cache-Control' => 'public, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
