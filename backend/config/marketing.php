<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Minimum pair support
    |--------------------------------------------------------------------------
    |
    | How many times two items must have been bought together before the pair
    | is allowed to advise a customer. Lift is a ratio, so a single fluke order
    | scores spectacularly on a sample of one — the floor is what stops the
    | "Goes well with" panel confidently recommending nonsense.
    |
    | Lower it while order history is still thin (a brand-new menu will not
    | clear a floor of 3 for weeks); raise it once there is real volume and you
    | want only well-evidenced pairings on the page. Pairs below the floor are
    | still computed and still appear in the admin report — the floor only
    | governs what customers are shown.
    |
    */

    'min_pair_support' => (int) env('MARKETING_MIN_PAIR_SUPPORT', 3),

];
