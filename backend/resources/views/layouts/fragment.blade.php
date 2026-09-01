{{-- Content alone — no doctype, no head, no chrome.

     Used when a page is being fetched to drop into something that is already
     a document: the menu's item sheet. Deliberately bare, so anything a
     fragment must not carry (canonical, meta, structured data) simply has
     nowhere to go. --}}
@yield('content')
