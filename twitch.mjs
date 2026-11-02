export function connectChat({token,clientId,broadcasterId,onSpawn,onMessage,onStatus,WebSocketImpl=globalThis.WebSocket,fetchImpl=globalThis.fetch,retryMs=5000}) {
 let stopped=false,socket=null,pending=null,retry;const sockets=new Map(),seen=new Set();
 const close=ws=>{clearTimeout(sockets.get(ws));sockets.delete(ws);ws.onclose=null;ws.onmessage=null;ws.onerror=null;ws.close();};
 const reconnect=()=>{
  if(stopped||retry)return;onStatus('reconnecting');
  for(const ws of [...sockets.keys()])close(ws);socket=pending=null;
  retry=setTimeout(()=>{retry=null;connect();},retryMs);
 };
 const connect=(url='wss://eventsub.wss.twitch.tv/ws',transferring=false)=>{
  if(stopped)return;let next;
  try{next=new WebSocketImpl(url);}catch{reconnect();return;}
  if(transferring)pending=next;else socket=next;let keepaliveMs=35000;
  const alive=ms=>{clearTimeout(sockets.get(next));sockets.set(next,setTimeout(()=>{close(next);reconnect();},ms));};
  alive(15000);
  next.onmessage=async({data})=>{
   if(stopped||!sockets.has(next))return;
   try{
    const m=JSON.parse(data),type=m.metadata.message_type;if(m.payload?.session?.keepalive_timeout_seconds)keepaliveMs=m.payload.session.keepalive_timeout_seconds*1000+5000;alive(keepaliveMs);
    if(type==='session_welcome'){
     if(transferring){const previous=socket;socket=next;pending=null;if(previous&&previous!==next)close(previous);}
     else{
      const response=await fetchImpl('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token}`,'Client-Id':clientId,'Content-Type':'application/json'},body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:broadcasterId,user_id:broadcasterId},transport:{method:'websocket',session_id:m.payload.session.id}})});
      if(!response.ok)throw Error('EventSub subscription failed ('+response.status+')');
     }
     if(!stopped&&sockets.has(next))onStatus('connected');
    }else if(type==='session_reconnect'){
     const target=new URL(m.payload.session.reconnect_url);if(target.protocol!=='wss:'||!target.hostname.endsWith('.twitch.tv'))throw Error('Invalid Twitch reconnect URL');
     if(!pending){onStatus('reconnecting');connect(target.href,true);}
    }else if(type==='revocation'){onStatus('authorization revoked');stop();}
    else if(type==='notification'&&!seen.has(m.metadata.message_id)){
     seen.add(m.metadata.message_id);if(seen.size>1000)seen.delete(seen.values().next().value);
     const e=m.payload.event,text=e.message?.text?.trim();if(text){if(onMessage)await onMessage(e.chatter_user_id,e.chatter_user_name,text);else if(text.toLowerCase()==='!spawn')onSpawn(e.chatter_user_id,e.chatter_user_name);}
    }
   }catch(error){if(!stopped){onStatus(error.message);reconnect();}}
  };
  next.onerror=()=>{if(!stopped)reconnect();};
  next.onclose=()=>{clearTimeout(sockets.get(next));sockets.delete(next);if(!stopped){if(next===socket&&pending){socket=null;return;}reconnect();}};
 };
 function stop(){stopped=true;clearTimeout(retry);for(const ws of [...sockets.keys()])close(ws);socket=pending=null;}
 connect();return stop;
}
