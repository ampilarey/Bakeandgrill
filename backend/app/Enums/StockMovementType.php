<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * @deprecated Not used by runtime stock paths. Movement `type` is a free string
 * on `stock_movements` (purchase, sale, waste, adjustment, refund, correction, …).
 * Kept only so older docs/references resolve; do not introduce new usages.
 */
enum StockMovementType: string
{
    case In = 'in';
    case Out = 'out';
    case Adjustment = 'adjustment';
}
