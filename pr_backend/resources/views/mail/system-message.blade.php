<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $heading }}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#1e3a8a;font-weight:bold;">
                {{ $agency }}
            </td>
        </tr>
        <tr>
            <td style="padding:24px;">
                <h1 style="margin:0 0 12px;font-size:18px;color:#0f172a;">{{ $heading }}</h1>
                @foreach ($lines as $line)
                    @if (trim($line) !== '')
                        <p style="margin:0 0 10px;font-size:14px;line-height:1.5;">{{ $line }}</p>
                    @endif
                @endforeach
                @if ($actionUrl)
                    <p style="margin:20px 0 0;">
                        <a href="{{ $actionUrl }}" style="display:inline-block;padding:10px 18px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;">{{ $actionLabel }}</a>
                    </p>
                    <p style="margin:12px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">{{ $actionUrl }}</p>
                @endif
            </td>
        </tr>
    </table>
</body>
</html>
