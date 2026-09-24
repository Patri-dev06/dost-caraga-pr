{{ $heading }}

@foreach ($lines as $line)
{{ $line }}
@endforeach
@if ($actionUrl)

{{ $actionLabel }}: {{ $actionUrl }}
@endif

— {{ $agency }}
