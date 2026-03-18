{{--
    Prayer Island Picker Component
    Props:
      $grouped        — Collection<string, Collection<IslandData>>
      $selectedIsland — ?IslandData
--}}
@props(['grouped', 'selectedIsland' => null])

<div class="isl-dropdown" id="islDropdown">
    <input type="hidden" name="island_id" id="island_id" value="{{ $selectedIsland?->id ?? '' }}">
    <button type="button" class="isl-trigger" id="islTrigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="isl-trigger-dv">{{ $selectedIsland?->name ?? 'ރަށް ހިޔާރު ކުރޭ' }}</span>
        @if($selectedIsland?->nameLatin)
            <span class="isl-trigger-latin">({{ $selectedIsland->nameLatin }})</span>
        @endif
        <span class="isl-arrow" aria-hidden="true">&#9660;</span>
    </button>

    <div class="isl-panel" id="islPanel" role="listbox">
        <div class="isl-search">
            <input type="text" id="islSearch" placeholder="Search island…" autocomplete="off" aria-label="Search islands">
        </div>
        <div class="isl-list" id="islList">
            @foreach($grouped as $atoll => $atollIslands)
                @php $atollLatin = $atollIslands->first()->atollLatin ?? null; @endphp
                <div class="isl-group" data-atoll="{{ strtolower($atoll) }}" data-atoll-lat="{{ strtolower($atollLatin ?? '') }}">
                    <div class="isl-group-label">
                        {{ $atoll }}
                        @if($atollLatin)
                            <span class="isl-group-label-lat">{{ $atollLatin }}</span>
                        @endif
                    </div>
                    @foreach($atollIslands as $isl)
                        <div class="isl-option {{ $isl->id === ($selectedIsland?->id ?? 0) ? 'selected' : '' }}"
                             role="option"
                             aria-selected="{{ $isl->id === ($selectedIsland?->id ?? 0) ? 'true' : 'false' }}"
                             data-id="{{ $isl->id }}"
                             data-dv="{{ $isl->name }}"
                             data-lat="{{ strtolower($isl->nameLatin ?? '') }}"
                             data-atoll="{{ strtolower($atoll) }}">
                            <span class="isl-opt-dv">{{ $isl->name }}</span>
                            @if($isl->nameLatin)
                                <span class="isl-opt-lat">{{ $isl->nameLatin }}</span>
                            @endif
                        </div>
                    @endforeach
                </div>
            @endforeach
        </div>
        <div class="isl-no-results" id="islNoResults" style="display:none">No islands found</div>
    </div>
</div>
