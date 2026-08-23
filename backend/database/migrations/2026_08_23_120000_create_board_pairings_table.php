<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Short-lived handshakes for pairing a wall screen.
 *
 * A television has no keyboard, so the long board key cannot be typed on it.
 * Instead the screen shows six characters, the owner types those into the
 * admin on their phone, and the screen collects its own key on the next poll.
 *
 * Two separate secrets, and the split is the point:
 *
 *   - `code` is shown on the television. Anyone in the room can read it, so it
 *     proves nothing on its own — it only lets the *owner* say which screen
 *     they are approving.
 *   - `poll_token_hash` is held by the browser that started the handshake and
 *     never displayed. It is what proves "I am the screen that asked". Without
 *     it, photographing the code off a screen would be enough to collect the
 *     key the moment an owner approved it.
 *
 * `board_token` holds the plaintext Sanctum key between approval and
 * collection. That is the one moment it exists in readable form, so it is
 * encrypted at rest and the row is deleted the instant the screen picks it up.
 * Rows expire in minutes either way — see BoardPairing::purgeExpired().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('board_pairings', function (Blueprint $table): void {
            $table->id();
            // Six characters from an unambiguous alphabet — read off a screen
            // across a room and typed on a phone, so no 0/O or 1/I/L.
            $table->string('code', 12)->unique();
            // SHA-256 of the poll token. Hashed, not encrypted: it only ever
            // needs comparing, never reading back.
            $table->string('poll_token_hash', 64)->index();
            $table->string('name', 60)->nullable();
            // TEXT: ciphertext of the plaintext key, present only between an
            // owner approving and the screen collecting.
            $table->text('board_token')->nullable();
            $table->unsignedBigInteger('personal_access_token_id')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            // useCurrent() is load-bearing on MySQL, not decoration. Only the
            // *first* TIMESTAMP column in a table gets an implicit
            // CURRENT_TIMESTAMP default; a later NOT NULL one with no default
            // falls back to '0000-00-00 00:00:00', which strict mode rejects
            // outright ("Invalid default value for 'expires_at'"). approved_at
            // above takes the first slot, so this column has to say it.
            // SQLite accepts the bare form happily, which is why the test suite
            // cannot see this — see BoardPairingTest::test_the_schema_is_valid…
            //
            // The value is fail-closed either way: a row written without an
            // expiry defaults to now, and the live() scope treats now-or-older
            // as expired.
            $table->timestamp('expires_at')->useCurrent()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('board_pairings');
    }
};
