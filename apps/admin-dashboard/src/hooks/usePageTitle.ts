import { useEffect } from 'react';

export function usePageTitle(title: string): void {
    useEffect(() => {
        document.title = `${title} — Bake & Grill Admin`;
    }, [title]);
}
