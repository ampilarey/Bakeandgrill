import re, os
LIGHT={'--color-text':'#1C1408','--color-bg':'#F8F6F3','--color-surface':'#FFFFFF',
 '--color-surface-hover':'#FDF8F4','--color-text-secondary':'#6B5D4F','--color-text-muted':'#9C8E7E',
 '--color-border':'#E8E0D8','--color-border-light':'#F0EBE5','--color-primary':'#D4813A',
 '--color-danger':'#EF4444','--color-success':'#22C55E','--color-warning':'#F59E0B'}
DARK={'--color-text':'#F0EAE0','--color-bg':'#0F0D0A','--color-surface':'#1C1910',
 '--color-surface-hover':'#252118','--color-text-secondary':'#C4B5A3','--color-text-muted':'#8A7D6D',
 '--color-border':'#2E2920','--color-border-light':'#252118','--color-primary':'#D4813A',
 '--color-danger':'#EF4444','--color-success':'#22C55E','--color-warning':'#F59E0B'}
def lum(h):
    h=h.lstrip('#')
    if len(h)==3: h=''.join(c*2 for c in h)
    r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=lum(a),lum(b); return (max(la,lb)+0.05)/(min(la,lb)+0.05)
def res(tok,M):
    m=re.match(r'var\((--color-[\w-]+)\)',tok)
    return M.get(m.group(1)) if m else (tok if re.match(r'#[0-9a-fA-F]{3,8}$',tok) else None)
V=r"(?:var\(--color-[\w-]+\)|#[0-9a-fA-F]{3,8})"
reg,pre=[],[]
for root,_,files in os.walk('src'):
    for fn in files:
        if not fn.endswith('.tsx'): continue
        p=os.path.join(root,fn)
        for i,l in enumerate(open(p,encoding='utf8'),1):
            bg=re.search(r'\b(?:background|backgroundColor):\s*[\'"]?('+V+r')',l)
            fg=re.search(r'\bcolor:\s*[\'"]?('+V+r')',l)
            if not(bg and fg): continue
            bl,fl=res(bg.group(1),LIGHT),res(fg.group(1),LIGHT)
            bd,fd=res(bg.group(1),DARK), res(fg.group(1),DARK)
            if not all([bl,fl,bd,fd]): continue
            rl,rd=ratio(fl,bl),ratio(fd,bd)
            if rd<4.5:
                (reg if rl>=4.5 else pre).append((round(rd,2),round(rl,2),p,i,bg.group(1),fg.group(1)))
reg.sort(); pre.sort()
print(f"### REGRESSIONS — fine in light, broken in dark: {len(reg)}\n")
for rd,rl,p,i,b,f in reg: print(f"  dark {rd:>5}:1  (light {rl:>5}:1)  {p}:{i}\n        bg {b} | fg {f}")
print(f"\n### PRE-EXISTING — already <4.5 in light too: {len(pre)}\n")
for rd,rl,p,i,b,f in pre: print(f"  dark {rd:>5}:1  (light {rl:>5}:1)  {p}:{i}  bg {b} | fg {f}")
