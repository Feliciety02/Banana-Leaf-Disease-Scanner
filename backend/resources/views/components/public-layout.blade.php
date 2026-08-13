<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} · DahonMD</title>
    <style>
        :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #10261d; background: #f3f8f5; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 32px 16px; }
        main { max-width: 720px; margin: 0 auto; background: white; border: 1px solid #d7e3dc; border-radius: 18px; padding: clamp(24px, 6vw, 48px); box-shadow: 0 16px 40px rgba(16, 38, 29, .08); }
        h1, h2 { line-height: 1.2; } h1 { margin-top: 0; } h2 { margin-top: 28px; font-size: 1.15rem; }
        p, li { line-height: 1.65; color: #496057; }
        label { display: block; margin-top: 18px; font-weight: 700; }
        input { width: 100%; margin-top: 7px; padding: 12px; border: 1px solid #adc2b6; border-radius: 9px; font: inherit; }
        button { margin-top: 22px; padding: 12px 18px; border: 0; border-radius: 9px; background: #167451; color: white; font: inherit; font-weight: 700; cursor: pointer; }
        .notice { padding: 12px 14px; border-radius: 9px; background: #e8f6ef; color: #12583f; }
        .error { color: #a52c2c; }
        a { color: #126547; }
    </style>
</head>
<body><main>{{ $slot }}</main></body>
</html>
