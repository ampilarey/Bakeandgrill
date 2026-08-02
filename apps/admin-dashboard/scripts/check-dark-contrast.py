import re, os
DARK={'--color-text':'#F0EAE0','--color-bg':'#0F0D0A','--color-surface':'#1C1910',
 '--color-text-secondary':'#C4B5A3','--color-text-muted':'#8A7D6D','--color-border':'#2E2920',
 '--color-primary':'#D4813A','--color-danger':'#EF4444','--color-success':'#22C55E','--color-warning':'#F59E0B'}
def lum(h):
    h=h.lstrip('#')
    if len(h)==3: h=''.join(c*2 for c in h)
    r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
bad=[]
for root,_,files in os.walk('src'):
    for fn in files:
        if not fn.endswith('.tsx'): continue
        p=os.path.join(root,fn)
        for i,l in enumerate(open(p,encoding='utf8'),1):
            if 'var(--color' not in l: continue
            bgl=re.search(r'\b(?:background|backgroundColor):\s*[\'"](#[0-9a-fA-F]{3,8})[\'"]',l)
            fgv=re.search(r'\bcolor:\s*[\'"]var\((--color-[\w-]+)\)[\'"]',l)
            if bgl and fgv and fgv.group(1) in DARK:
                bg=bgl.group(1); fg=DARK[fgv.group(1)]
                r=ratio(fg,bg)
                if r<4.5: bad.append((p,i,bg,fgv.group(1),fg,round(r,2)))
bad.sort(key=lambda x:x[5])
print(f"Dark-mode contrast failures (hardcoded bg + themed text): {len(bad)}\n")
for p,i,bg,v,fg,r in bad:
    flag='INVISIBLE' if r<1.5 else ('FAIL' if r<3 else 'low')
    print(f"  {r:>5}:1  {flag:<9} {p}:{i}  bg {bg} + {v}({fg})")
