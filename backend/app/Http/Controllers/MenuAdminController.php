<?php

namespace App\Http\Controllers;

class MenuAdminController extends Controller
{
    /**
     * Show the menu admin page (add/delete items).
     * Actual API calls are made from the page with staff token.
     */
    public function index()
    {
        return view('admin.menu');
    }
}
