<!DOCTYPE html>
<html lang="en">
<body style="font-family: sans-serif; color: #1c1408;">
<p>Please print poster {{ $code }} ({{ $order->poster->name ?? 'Poster' }}).</p>
<p>
    Material: {{ $order->material }}.
    White: {{ $order->white }}.
    Gloss: {{ $order->gloss }}.
    On the sheet: {{ $order->imposition }}.
    @if ($order->deadline) Deadline: {{ $order->deadline->toDateString() }}. @endif
</p>
<p>The ZIP has the print PDF, the spec sheet, and masks when they were asked for. The JPG is a proof to look at, not to print.</p>
</body>
</html>
