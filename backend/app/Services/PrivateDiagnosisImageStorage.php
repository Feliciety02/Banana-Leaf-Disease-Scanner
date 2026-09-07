<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PrivateDiagnosisImageStorage
{
    private const MAX_OUTPUT_DIMENSION = 4096;
    private const MAX_INPUT_PIXELS = 13_000_000;

    public function store(UploadedFile $image): string
    {
        $dimensions = @getimagesize($image->getRealPath());
        if (! $dimensions || ($dimensions[0] * $dimensions[1]) > self::MAX_INPUT_PIXELS) {
            throw ValidationException::withMessages([
                'image' => 'The uploaded image is too large to process safely.',
            ]);
        }

        $mime = $image->getMimeType();
        $source = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($image->getRealPath()),
            'image/png' => @imagecreatefrompng($image->getRealPath()),
            'image/webp' => @imagecreatefromwebp($image->getRealPath()),
            default => false,
        };
        if (! $source) {
            throw ValidationException::withMessages(['image' => 'The uploaded image could not be decoded safely.']);
        }

        if ($mime === 'image/jpeg') {
            $source = $this->normalizeJpegOrientation($source, $image->getRealPath());
        }

        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1, self::MAX_OUTPUT_DIMENSION / max($width, $height));
        $outputWidth = max(1, (int) round($width * $scale));
        $outputHeight = max(1, (int) round($height * $scale));
        $output = imagecreatetruecolor($outputWidth, $outputHeight);
        if (in_array($mime, ['image/png', 'image/webp'], true)) {
            imagealphablending($output, false);
            imagesavealpha($output, true);
        }
        imagecopyresampled($output, $source, 0, 0, 0, 0, $outputWidth, $outputHeight, $width, $height);

        ob_start();
        $encoded = match ($mime) {
            'image/jpeg' => imagejpeg($output, null, 90),
            'image/png' => imagepng($output, null, 6),
            'image/webp' => imagewebp($output, null, 88),
        };
        $contents = ob_get_clean();
        imagedestroy($source);
        imagedestroy($output);

        if (! $encoded || ! is_string($contents) || $contents === '') {
            throw ValidationException::withMessages(['image' => 'The uploaded image could not be sanitized.']);
        }

        $extension = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        };
        $path = 'diagnoses/'.Str::uuid().'.'.$extension;
        if (! Storage::disk('local')->put($path, $contents)) {
            throw ValidationException::withMessages(['image' => 'The sanitized image could not be stored.']);
        }

        return $path;
    }

    private function normalizeJpegOrientation(\GdImage $image, string $path): \GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }
        $orientation = @exif_read_data($path, 'IFD0')['Orientation'] ?? 1;

        return match ($orientation) {
            2 => tap($image, fn ($value) => imageflip($value, IMG_FLIP_HORIZONTAL)),
            3 => imagerotate($image, 180, 0),
            4 => tap($image, fn ($value) => imageflip($value, IMG_FLIP_VERTICAL)),
            5 => tap(imagerotate($image, -90, 0), fn ($value) => imageflip($value, IMG_FLIP_HORIZONTAL)),
            6 => imagerotate($image, -90, 0),
            7 => tap(imagerotate($image, 90, 0), fn ($value) => imageflip($value, IMG_FLIP_HORIZONTAL)),
            8 => imagerotate($image, 90, 0),
            default => $image,
        };
    }
}
