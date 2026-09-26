// Isolated test data served only by test/visual-server.mjs. Never served by production.
const now = new Date().toISOString();
const user = { id:'preview', username:'Blunt OaO', tribeId:'preview-tribe', tribeName:'OaO', roles:['member'], status:'active', email:'preview@example.invalid', emailVerified:true, server:'Server 1347', map:'The Island' };
const orders = [
  ['rex_egg','Rex Ei','egg','BlackPhoenix'], ['argentavis_saddle','Argentavis Sattel','saddle','Luna'], ['tek_generator','Tek Generator','structure','Storm']
].map(([key,name,type,author],i)=>({id:i+1,member_id:i===0?'preview':'other',member_username:author,status:'open',priority:i===2?'urgent':'normal',created_at:now,items:[{item_key:key,item_name:name,product_type:type,quantity:1,status:'open'}]}));
const server={id:'preview-server',name:'Server 1347',map_name:'The Island',status:'active',markers:[{name:'Basis OaO',category:'base',coord_x:20,coord_y:48},{name:'Metall',category:'resource',coord_x:48,coord_y:28},{name:'Gefahr',category:'boss',coord_x:76,coord_y:40}]};
const messages=[{author_name:'Luna',body:'Ich bin gleich am Berg, wer braucht noch Metall?',created_at:now},{author_name:'BlackPhoenix',body:'Rex ist fast fertig, fehlt nur noch 1 Ei!',created_at:now},{author_name:'Storm',body:'Habe die Tek-Teile im Grünen Obelisken gefunden.',created_at:now}];
const originalFetch=window.fetch.bind(window);
window.fetch=async (input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin);
  if(!url.pathname.startsWith('/api/')) return originalFetch(input,options);
  let data={};
  if(url.pathname==='/api/auth/me')data={user};
  else if(url.pathname==='/api/users/me')data={user};
  else if(url.pathname==='/api/notifications/preferences')data={preferences:[{type:'order_created',enabled:true},{type:'order_completed',enabled:true}]};
  else if(url.pathname==='/api/dinos')data={dinos:[]};
  else if(url.pathname==='/api/categories')data={categories:[{id:'land',name:'Landtiere',key:'land'}]};
  else if(url.pathname==='/api/items')data={items:orders.flatMap(o=>o.items).map((i,n)=>({...i,id:'item-'+n,key:i.item_key,name:i.item_name,category_id:'land',category_key:'land',category_name:'Landtiere'}))};
  else if(url.pathname.startsWith('/api/orders/')){const order=orders.find(o=>String(o.id)===url.pathname.split('/')[3]);data=url.pathname.endsWith('/comments')?{comments:[]}:{order};}
  else if(url.pathname==='/api/tribes/me')data={tribe:{name:'OaO'}};
  else if(url.pathname==='/api/orders' && options.method==='POST'){
    const body=JSON.parse(options.body);
    const order={...orders[0],id:4,member_id:user.id,member_username:user.username,priority:body.priority,note:body.note,items:body.items.map(i=>({...orders.flatMap(o=>o.items)[Number(i.itemId.split('-')[1])],quantity:i.quantity}))};
    orders.push(order);data={order};
  }
  else if(url.pathname==='/api/orders')data={orders:url.searchParams.get('scope')==='history'?[]:orders};
  else if(url.pathname==='/api/tasks')data={tasks:[{id:'task1',title:'Metall sammeln',assignee_id:'preview',status:'open'}]};
  else if(url.pathname==='/api/servers')data={servers:[server]};
  else if(url.pathname==='/api/servers/preview-server')data={server};
  else if(url.pathname==='/api/voice/channels')data={channels:[{name:'Allgemein',participants:[{user_id:'one'},{user_id:'two'}]}]};
  else if(url.pathname==='/api/chat/messages')data=options.method==='POST'?{message:{author_name:user.username,body:JSON.parse(options.body).body,created_at:now}}:{messages};
  else if(url.pathname==='/api/notifications')data={notifications:[]};
  else if(url.pathname==='/api/news')data={news:[]};
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
await import('/js/app.js');
