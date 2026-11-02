import {writeFile,rename,mkdir,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function atomicWrite(file,value){
 await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
 try{await writeFile(temp,value,{mode:0o600});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
}
let envWrites=Promise.resolve();
export function saveEnv(file,values){
 envWrites=envWrites.catch(()=>{}).then(async()=>{let text=await readFile(file,'utf8');for(const [key,value]of Object.entries(values)){if(!/^[A-Z_]+$/.test(key)||!/^[-a-zA-Z0-9_.]*$/.test(value))throw Error('Invalid credential value');const re=new RegExp('^'+key+'=.*$','m');text=re.test(text)?text.replace(re,key+'='+value):text+'\n'+key+'='+value+'\n';}await atomicWrite(file,text);});return envWrites;
}
