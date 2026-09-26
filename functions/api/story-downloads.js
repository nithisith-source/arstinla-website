function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}

function validBook(value){
  const book=String(value||"").trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(book)?book:null;
}

function validAction(value){
  return value==="share"||value==="download"?value:null;
}

async function readNumber(store,key){
  const value=Number(await store.get(key));
  return Number.isFinite(value)&&value>=0?Math.floor(value):0;
}

function key(book,action){
  return `story:${book}:${action}`;
}

export async function onRequestGet({request,env}){
  const book=validBook(new URL(request.url).searchParams.get("book"));
  if(!book)return json({ok:false,error:"Invalid book"},400);
  if(!env.BIRTHDAY_STATS)return json({ok:false,error:"Story counter is not configured"},503);
  const [shares,downloads]=await Promise.all([
    readNumber(env.BIRTHDAY_STATS,key(book,"share")),
    readNumber(env.BIRTHDAY_STATS,key(book,"download"))
  ]);
  return json({ok:true,book,shares,downloads});
}

export async function onRequestPost({request,env}){
  if(!env.BIRTHDAY_STATS)return json({ok:false,error:"Story counter is not configured"},503);
  const requestUrl=new URL(request.url);
  const origin=request.headers.get("origin");
  const fetchSite=request.headers.get("sec-fetch-site");
  if((origin&&origin!==requestUrl.origin)||(fetchSite&&fetchSite!=="same-origin"))return json({ok:false,error:"Forbidden"},403);

  let body;
  try{body=await request.json();}catch{return json({ok:false,error:"Invalid JSON"},400);}
  const book=validBook(body?.book);
  const action=validAction(body?.action);
  if(!book||!action)return json({ok:false,error:"Invalid request"},400);

  const statKey=key(book,action);
  const count=(await readNumber(env.BIRTHDAY_STATS,statKey))+1;
  await env.BIRTHDAY_STATS.put(statKey,String(count));
  const other=action==="share"?"download":"share";
  const otherCount=await readNumber(env.BIRTHDAY_STATS,key(book,other));
  return json({ok:true,book,shares:action==="share"?count:otherCount,downloads:action==="download"?count:otherCount});
}
