/* ARSTINLA tiny DXF (R12 / AC1009) writer — lines, text, 3D faces, layers. Units: metres. */
(function(){
  const esc=s=>String(s).replace(/[^\x20-\x7e]/g,c=>"\\U+"+c.codePointAt(0).toString(16).toUpperCase().padStart(4,"0"));
  const n=v=>(Math.round(v*10000)/10000).toString();
  function DXF(){this.layers=new Map();this.ents=[]}
  DXF.prototype.layer=function(name,color){if(!this.layers.has(name))this.layers.set(name,color||7);return name};
  DXF.prototype.line=function(L,x1,y1,x2,y2,z1,z2){this.layer(L);this.ents.push(["0","LINE","8",L,"10",n(x1),"20",n(y1),"30",n(z1||0),"11",n(x2),"21",n(y2),"31",n(z2==null?(z1||0):z2)]);return this};
  DXF.prototype.poly=function(L,pts,closed){for(let i=0;i<pts.length-(closed?0:1);i++){const a=pts[i],b=pts[(i+1)%pts.length];this.line(L,a[0],a[1],b[0],b[1],a[2],b[2])}return this};
  DXF.prototype.rect=function(L,x0,y0,x1,y1,z){return this.poly(L,[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]],true)};
  DXF.prototype.text=function(L,x,y,h,str,center){this.layer(L);const e=["0","TEXT","8",L,"10",n(x),"20",n(y),"30","0","40",n(h),"1",esc(str)];if(center)e.push("72","1","11",n(x),"21",n(y),"31","0");this.ents.push(e);return this};
  DXF.prototype.face=function(L,p){this.layer(L);const q=p.length===3?[p[0],p[1],p[2],p[2]]:p.slice(0,4),e=["0","3DFACE","8",L];q.forEach((v,i)=>e.push(String(10+i),n(v[0]),String(20+i),n(v[1]),String(30+i),n(v[2]||0)));this.ents.push(e);return this};
  DXF.prototype.toString=function(){const o=["0","SECTION","2","HEADER","9","$ACADVER","1","AC1009","9","$INSUNITS","70","6","0","ENDSEC",
    "0","SECTION","2","TABLES","0","TABLE","2","LTYPE","70","1","0","LTYPE","2","CONTINUOUS","70","0","3","Solid line","72","65","73","0","40","0.0","0","ENDTAB",
    "0","TABLE","2","LAYER","70",String(this.layers.size+1),"0","LAYER","2","0","70","0","62","7","6","CONTINUOUS"];
    this.layers.forEach((c,name)=>o.push("0","LAYER","2",name,"70","0","62",String(c),"6","CONTINUOUS"));
    o.push("0","ENDTAB","0","ENDSEC","0","SECTION","2","ENTITIES");this.ents.forEach(e=>o.push(...e));o.push("0","ENDSEC","0","EOF");return o.join("\r\n")+"\r\n"};
  DXF.prototype.download=function(name){const blob=new Blob([this.toString()],{type:"application/dxf"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name.replace(/[\\/:*?"<>|]+/g,"-")+".dxf";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)};
  window.ArstinlaDXF=DXF;
})();
