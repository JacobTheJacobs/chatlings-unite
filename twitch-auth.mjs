// Retry transient failures and rotate tokens without logging credentials.
export class TwitchAuth {
 constructor({clientId,clientSecret,broadcasterId,accessToken='',refreshToken='',save,start,stop,status,fetchImpl=globalThis.fetch,retryMs=15000}){Object.assign(this,{clientId,clientSecret,broadcasterId,accessToken,refreshToken,save,start,stop,status,fetchImpl,retryMs});this.closed=false;this.running=false;this.timer=null;this.busy=false;this.shutdown=new AbortController();}
 async request(url,options={}){return this.fetchImpl(url,{...options,signal:AbortSignal.any([this.shutdown.signal,AbortSignal.timeout(10000)])});}
 async rotate(){
  if(!this.refreshToken)throw Error('Reconnect Twitch chat once to enable automatic token refresh');
  const r=await this.request('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:this.refreshToken,client_id:this.clientId,client_secret:this.clientSecret})});
  if(!r.ok)throw Error(r.status===400||r.status===401?'Twitch authorization expired; reconnect chat':'Twitch refresh unavailable');
  const token=await r.json();if(this.closed)throw Error('Authentication stopped');if(!token.access_token)throw Error('Invalid Twitch refresh response');
  await this.save(token);if(this.closed)return;this.accessToken=token.access_token;this.refreshToken=token.refresh_token||this.refreshToken;
  this.stop();this.running=false;
 }
 async check(){
  if(this.closed||this.busy)return;this.busy=true;let delay=this.retryMs;
  try{
   let r=await this.request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+this.accessToken}});
   if(r.status===401){this.stop();this.running=false;await this.rotate();r=await this.request('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+this.accessToken}});}
   if(!r.ok)throw Error('Twitch validation unavailable');
   let v=await r.json();
   if(v.user_id!==this.broadcasterId||v.client_id!==this.clientId||!v.scopes?.includes('user:read:chat')){this.stop();this.running=false;throw Error('Twitch identity or chat permission changed; reconnect chat');}
   if(v.expires_in<300&&this.refreshToken){await this.rotate();delay=0;}
   else{if(!this.closed&&!this.running){this.start(this.accessToken,this.broadcasterId);this.running=true;}delay=Math.max(1000,Math.min(3600000,((v.expires_in||3600)-240)*1000));}
  }catch(error){if(!this.closed&&!this.running)this.status(error.message);}
  finally{this.busy=false;if(!this.closed)this.timer=setTimeout(()=>this.check(),delay);this.timer?.unref?.();}
 }
 close(){this.closed=true;this.shutdown.abort();clearTimeout(this.timer);this.stop();}
}
