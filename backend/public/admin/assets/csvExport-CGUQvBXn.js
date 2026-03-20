function i(t,o){if(o.length===0)return;const s=Object.keys(o[0]),d=c=>{const e=c==null?"":String(c);return e.includes(",")||e.includes('"')||e.includes(`
`)?`"${e.replace(/"/g,'""')}"`:e},r=[s.map(d).join(","),...o.map(c=>s.map(e=>d(c[e])).join(","))].join(`
`),a=new Blob([r],{type:"text/csv;charset=utf-8;"}),l=URL.createObjectURL(a),n=document.createElement("a");n.href=l,n.download=t.endsWith(".csv")?t:`${t}.csv`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(l)}export{i as d};
