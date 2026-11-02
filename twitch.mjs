export function connectChat({token,clientId,broadcasterId,onSpawn,onMessage,onStatus}) {
  let stopped=false, socket, retry, watchdog; const seen=new Set();
  const connect=(url='wss://eventsub.wss.twitch.tv/ws', transferring=false)=>{
    if(stopped) return;
    const next=new WebSocket(url); if(!transferring) socket=next; let handoff=false;
    const alive=()=>{ clearTimeout(watchdog); watchdog=setTimeout(()=>next.close(),45000); };
    next.onmessage=async ({data})=>{
      try {
        alive(); const m=JSON.parse(data), type=m.metadata.message_type;
        if(type==='session_welcome') {
          const previous=socket; socket=next; if(transferring) previous?.close();
          if(!transferring) {
            const response=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Client-Id':clientId,'Content-Type':'application/json'},body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:broadcasterId,user_id:broadcasterId},transport:{method:'websocket',session_id:m.payload.session.id}})});
            if(!response.ok) throw Error(`EventSub subscription failed (${response.status}); verify broadcaster token and user:read:chat scope`);
          }
          onStatus('connected');
        } else if(type==='session_reconnect') { handoff=true; connect(m.payload.session.reconnect_url,true); }
        else if(type==='revocation') { onStatus('authorization revoked'); stopped=true; next.close(); }
        else if(type==='notification' && !seen.has(m.metadata.message_id)) {
          seen.add(m.metadata.message_id); if(seen.size>1000) seen.delete(seen.values().next().value);
          const event=m.payload.event; const text=event.message?.text?.trim(); if(text) { if(onMessage) await onMessage(event.chatter_user_id,event.chatter_user_name,text); else if(text.toLowerCase()==='!spawn') onSpawn(event.chatter_user_id,event.chatter_user_name); }
        }
      } catch(error) { onStatus(error.message); next.close(); }
    };
    next.onerror=()=>onStatus('connection error');
    next.onclose=()=>{ if(!stopped&&!handoff&&(!socket||socket===next)) {onStatus('reconnecting'); retry=setTimeout(()=>connect(),5000);} };
  };
  connect(); return ()=>{stopped=true;clearTimeout(retry);clearTimeout(watchdog);socket?.close();};
}
