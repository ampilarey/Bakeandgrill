@extends('layout')

@section('title', 'Approve post – ' . content('site_name', 'Bake & Grill'))
@section('description', 'Approve or reject a social post drafted by the Bake & Grill admin.')

@section('styles')
<style>
.sa-wrap { max-width: 520px; margin: 0 auto; padding: 2rem 1rem 4rem; box-sizing: border-box; }
.sa-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
.sa-card img { display: block; width: 100%; max-height: 360px; object-fit: cover; }
.sa-body { padding: 1rem 1.25rem; }
.sa-eyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber); margin: 0 0 0.4rem; }
.sa-caption { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 1rem; color: var(--dark); margin: 0 0 0.75rem; }
.sa-meta { font-size: 0.85rem; color: var(--muted); margin: 0 0 1rem; }
.sa-actions { display: grid; gap: 0.6rem; }
.sa-actions form { margin: 0; }
.sa-btn { display: flex; width: 100%; min-height: 48px; align-items: center; justify-content: center; border-radius: 12px; font: inherit; font-weight: 700; font-size: 1rem; cursor: pointer; border: 1.5px solid var(--border); background: var(--surface); color: var(--dark); }
.sa-btn--go { background: var(--amber); border-color: var(--amber); color: #fff; }
.sa-done { padding: 1rem 1.25rem; border-radius: 12px; background: var(--amber-light); color: var(--dark); font-weight: 700; margin-bottom: 1rem; }
</style>
@endsection

@section('content')
<div class="sa-wrap">
    @if(session('social_approval') === 'approved')
        <div class="sa-done" data-testid="approval-done">Approved — it is going out now.</div>
    @elseif(session('social_approval') === 'rejected')
        <div class="sa-done" data-testid="approval-done">Rejected — nothing will be posted.</div>
    @endif
    <div class="sa-card">
        @if($post->imageUrl())
            <img src="{{ $post->imageUrl() }}" alt="">
        @endif
        <div class="sa-body">
            <p class="sa-eyebrow">Social post #{{ $post->id }} · {{ str_replace('_', ' ', $post->status) }}</p>
            <p class="sa-caption">{{ $post->caption() }}</p>
            @if($post->captionDv() !== '')
                <p class="sa-caption" dir="rtl">{{ $post->captionDv() }}</p>
            @endif
            <p class="sa-meta">To: {{ implode(', ', $channels) ?: 'no channels' }}</p>
            @if($canAct)
                <div class="sa-actions">
                    <form method="post" action="{{ $approveUrl }}">
                        @csrf
                        <button type="submit" class="sa-btn sa-btn--go" data-testid="approve">Approve &amp; post</button>
                    </form>
                    <form method="post" action="{{ $rejectUrl }}">
                        @csrf
                        <button type="submit" class="sa-btn" data-testid="reject">Reject</button>
                    </form>
                </div>
            @else
                <p class="sa-meta" data-testid="approval-closed">This post is {{ str_replace('_', ' ', $post->status) }}; nothing more to decide here.</p>
            @endif
        </div>
    </div>
</div>
@endsection
