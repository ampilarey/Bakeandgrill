{{-- An opened item with no photo (owner, 2026-10-07, "option 1"): the no-photo tile,
     cream with the logo in a soft circle, drawn with the moving logo. Same geometry
     as brand/default-item-image.png (circle 8/9 of the height, the logo 60% of it),
     so it matches the still tile the menu cards keep. The tile is always cream, so
     the lettering stays dark in dark mode (bgl--light). Used only while
     ItemDisplayPhoto says animated_tile; $tileLabel is the item's name. --}}
@once
<style>
.bgl-tile{position:absolute;inset:0;background:#F8F6F3;display:flex;align-items:center;justify-content:center;overflow:hidden}
.bgl-tile::before{content:"";position:absolute;left:50%;top:50%;height:88.9%;aspect-ratio:1;border-radius:50%;background:#F1E7DC;transform:translate(-50%,-50%)}
.bgl-tile .bgl{position:relative;height:69.8%;width:auto;aspect-ratio:1}
</style>
@endonce
<div class="bgl-tile">
    @include('partials.animated-logo', ['alogoId' => '-tile', 'alogoClass' => 'bgl--light', 'alogoLabel' => $tileLabel])
</div>
