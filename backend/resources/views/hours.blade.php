@extends('layout')

@section('title', 'Opening Hours - Bake & Grill')

@section('styles')
<style>
    .hours-hero {
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
        padding: 3rem 2rem;
        text-align: center;
    }

    .hours-hero h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
    }

    .hours-content {
        max-width: 800px;
        margin: 3rem auto 4rem;
        padding: 0 2rem;
    }

    .hours-table {
        background: white;
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .hours-row {
        display: flex;
        justify-content: space-between;
        padding: 1.25rem 2rem;
        border-bottom: 1px solid var(--border);
    }

    .hours-row:last-child {
        border-bottom: none;
    }

    .hours-row.today {
        background: rgba(27, 163, 185, 0.05);
        font-weight: 600;
    }

    .day {
        font-weight: 500;
    }

    .time {
        color: var(--teal);
        font-weight: 600;
    }

    .closure-notice {
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 2rem;
        text-align: center;
    }
</style>
@endsection

@section('content')
<div class="hours-hero">
    <h1>Opening Hours</h1>
    @if($isOpen)
        <span class="status-badge open">● We're Open Now</span>
    @else
        <span class="status-badge closed">● Currently Closed</span>
    @endif
</div>

<div class="hours-content">
    @if($closureReason)
        <div class="closure-notice">
            <strong>Special Closure:</strong> {{ $closureReason }}
        </div>
    @endif

    <div class="hours-table">
        @php
            $days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            $today = now(config('opening_hours.timezone'))->dayOfWeek;
        @endphp
        
        @foreach($days as $index => $day)
            @php
                $dayHours = $hours[$index] ?? null;
            @endphp
            <div class="hours-row {{ $index === $today ? 'today' : '' }}">
                <span class="day">{{ $day }}</span>
                <span class="time">
                    @if($dayHours && !($dayHours['closed'] ?? false))
                        {{ $dayHours['open'] }} - {{ $dayHours['close'] }}
                    @else
                        Closed
                    @endif
                </span>
            </div>
        @endforeach
    </div>

    <div style="margin-top: 2rem; text-align: center; color: #636e72;">
        <p>Hours may vary on public holidays. Call ahead to confirm.</p>
        <p style="margin-top: 1rem;">
            <a href="/contact" style="color: var(--teal); font-weight: 500;">Contact us →</a>
        </p>
    </div>
</div>
@endsection
