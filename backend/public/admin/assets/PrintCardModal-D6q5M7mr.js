import{j as i}from"./index-BuX9-xXi.js";import{b as m}from"./vendor-HEF0F3_5.js";import{Q as y}from"./index-D4CNE1So.js";import{M as u,S as p,k as b,B as x}from"./SharedUI-CBssoz_V.js";const g=[{label:"CR80 (Credit Card)",widthMm:85.6,heightMm:54,description:"Standard credit card size"},{label:"CR79",widthMm:84,heightMm:53.5,description:"Slightly smaller than CR80"},{label:"Half Card",widthMm:85.6,heightMm:27,description:"Half credit card height"},{label:"Business Card",widthMm:89,heightMm:51,description:"Standard business card"},{label:"Square (63mm)",widthMm:63,heightMm:63,description:"Square format"}],f=3.78;function j({data:e,size:s}){const a=s.widthMm*f,n=s.heightMm*f,l=e.type==="gift_card",h=e.type==="discount_card",o=l?"#D4813A":h?"#2A1E0C":"#1C5F3A",r=Math.min(n*.45,72),c=e.expiry?new Date(e.expiry).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):null;return i.jsxs("div",{style:{width:a,height:n,background:"#fff",borderRadius:8,overflow:"hidden",position:"relative",fontFamily:"system-ui, -apple-system, sans-serif",boxShadow:"0 2px 12px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"},children:[i.jsxs("div",{style:{background:o,height:n*.32,padding:"8px 12px",display:"flex",flexDirection:"column",justifyContent:"center"},children:[i.jsx("div",{style:{color:"rgba(255,255,255,0.75)",fontSize:Math.max(7,n*.09),fontWeight:600,letterSpacing:1,textTransform:"uppercase"},children:e.logoText??"Bake & Grill"}),i.jsx("div",{style:{color:"#fff",fontSize:Math.max(9,n*.13),fontWeight:800,lineHeight:1.1,marginTop:2},children:e.title})]}),i.jsxs("div",{style:{flex:1,display:"flex",gap:8,padding:"8px 12px",alignItems:"center"},children:[i.jsxs("div",{style:{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:4,minWidth:0},children:[e.subtitle&&i.jsx("div",{style:{color:o,fontSize:Math.max(11,n*.18),fontWeight:900,lineHeight:1,letterSpacing:-.5},children:e.subtitle}),i.jsx("div",{style:{background:"#F5F0EB",borderRadius:4,padding:"3px 7px",display:"inline-block",width:"fit-content"},children:i.jsx("span",{style:{fontSize:Math.max(8,n*.11),fontWeight:700,letterSpacing:2,color:"#1C1408",fontFamily:"monospace"},children:e.code})}),e.note&&i.jsx("div",{style:{fontSize:Math.max(6,n*.09),color:"#9C8E7E",lineHeight:1.2},children:e.note}),c&&i.jsxs("div",{style:{fontSize:Math.max(6,n*.09),color:"#9C8E7E"},children:["Expires: ",c]})]}),i.jsxs("div",{style:{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:2},children:[i.jsx("div",{style:{background:"#fff",padding:3,borderRadius:4,border:"1px solid #E8E0D8"},children:i.jsx(y,{value:e.code,size:r,level:"M"})}),i.jsx("div",{style:{fontSize:Math.max(5,n*.08),color:"#C0B4A8"},children:"Scan or enter code"})]})]})]})}function C({data:e,onClose:s}){const[a,n]=m.useState(0),[l,h]=m.useState(1),o=m.useRef(null),r=g[a],c=()=>{const t=o.current;if(!t)return;const d=window.open("","_blank","width=800,height=600");d&&(d.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Card — ${e.code}</title>
        <style>
          @page { margin: 10mm; size: A4; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #fff; }
          .card-wrap {
            display: inline-block;
            margin: 4mm;
            width: ${r.widthMm}mm;
            height: ${r.heightMm}mm;
            break-inside: avoid;
          }
          .card-wrap > div { width: ${r.widthMm}mm !important; height: ${r.heightMm}mm !important; }
          .print-grid { display: flex; flex-wrap: wrap; align-items: flex-start; }
        </style>
      </head>
      <body>
        <div class="print-grid">
          ${Array.from({length:l}).map(()=>`<div class="card-wrap">${t.innerHTML}</div>`).join("")}
        </div>
        <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
      </body>
      </html>
    `),d.document.close())};return i.jsxs(u,{title:"Print Card",onClose:s,maxWidth:560,children:[i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:20},children:[i.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12},children:[i.jsxs("div",{children:[i.jsx("label",{style:{display:"block",fontSize:12,fontWeight:600,color:"#475569",marginBottom:4},children:"Card Size"}),i.jsx(p,{value:String(a),onChange:t=>n(Number(t)),options:g.map((t,d)=>({value:String(d),label:`${t.label} (${t.widthMm}×${t.heightMm}mm)`}))}),i.jsx("div",{style:{fontSize:11,color:"#9C8E7E",marginTop:3},children:r.description})]}),i.jsxs("div",{children:[i.jsx("label",{style:{display:"block",fontSize:12,fontWeight:600,color:"#475569",marginBottom:4},children:"Copies"}),i.jsx(p,{value:String(l),onChange:t=>h(Number(t)),options:[1,2,3,4,5,6,8,10,20].map(t=>({value:String(t),label:`${t} cop${t===1?"y":"ies"}`}))})]})]}),i.jsxs("div",{children:[i.jsx("div",{style:{fontSize:12,fontWeight:600,color:"#475569",marginBottom:8},children:"Preview"}),i.jsx("div",{style:{background:"#F5F0EB",borderRadius:10,padding:20,display:"flex",justifyContent:"center",alignItems:"center",minHeight:140},children:i.jsx("div",{ref:o,children:i.jsx(j,{data:e,size:r})})}),i.jsxs("div",{style:{textAlign:"center",fontSize:11,color:"#9C8E7E",marginTop:6},children:[r.widthMm," × ",r.heightMm," mm — actual print size"]})]})]}),i.jsxs(b,{children:[i.jsx(x,{variant:"ghost",onClick:s,children:"Cancel"}),i.jsxs(x,{onClick:c,children:["🖨️ Print ",l>1?`${l} Copies`:"Card"]})]})]})}export{C as P};
