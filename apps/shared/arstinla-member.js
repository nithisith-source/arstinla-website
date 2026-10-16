// window.ARSTINLA.getMember() → {id, name, loggedIn, isPro, tier}
// Shared helper for apps on arstinla.com. Uses the LINE member session (/api/auth/me).
(function(){
  "use strict";
  let cached=null;
  window.ARSTINLA=window.ARSTINLA||{};
  window.ARSTINLA.getMember=function(){
    if(!cached)cached=fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"})
      .then(r=>r.json())
      .then(d=>{const m=d&&d.member;if(!m)return{id:"",name:"",loggedIn:false,isPro:false,tier:"free"};
        return{id:m.uid||"member",name:m.name||"",loggedIn:true,isPro:m.tier&&m.tier!=="free",tier:m.tier||"free",picture:m.picture||""}})
      .catch(()=>({id:"",name:"",loggedIn:false,isPro:false,tier:"free",offline:true}));
    return cached;
  };
})();
