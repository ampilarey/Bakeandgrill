<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class OpeningSoonController extends Controller
{
    /**
     * Display the opening soon page
     */
    public function index()
    {
        return view('opening-soon');
    }
}
