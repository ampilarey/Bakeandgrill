<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Frontend Order Status URL
    |--------------------------------------------------------------------------
    | Base URL for the online order status page in the frontend SPA.
    | After a BML payment, customers are redirected to:
    |   {order_status_url}/{orderId}?payment={state}
    |
    | Set FRONTEND_ORDER_STATUS_URL in your .env file.
    | Example: https://app.bakeandgrill.mv/orders
    */
    'order_status_url' => rtrim(env('FRONTEND_ORDER_STATUS_URL', ''), '/'),
];
