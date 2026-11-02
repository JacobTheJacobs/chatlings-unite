import {spawn} from 'node:child_process';
export function runProcess(command,args,{cwd,env,stdin='',log,timeoutMs=20*60*1000,signal,onChild=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('Generation cancelled'));
  const child=spawn(command,args,{cwd,env,detached:process.platform!=='win32',stdio:['pipe',log??'ignore',log??'ignore']});onChild(child);
  let reason,force;
  const kill=sig=>{try{if(process.platform!=='win32')process.kill(-child.pid,sig);else child.kill(sig);}catch{}};
  const cancel=message=>{reason=message;kill('SIGTERM');force??=setTimeout(()=>kill('SIGKILL'),1000);};
  const abort=()=>cancel('Generation cancelled');signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>cancel('Generation timed out'),timeoutMs);
  const clean=()=>{clearTimeout(timer);clearTimeout(force);signal?.removeEventListener('abort',abort);onChild(null);};
  child.once('error',error=>{clean();reject(error);});
  child.once('close',code=>{if(reason)kill('SIGKILL');clean();reason?reject(Error(reason)):code===0?resolve():reject(Error(`${command} exited ${code}`));});
  child.stdin.on('error',()=>{});child.stdin.end(stdin);
 });
}
