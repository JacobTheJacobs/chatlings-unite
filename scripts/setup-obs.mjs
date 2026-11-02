import {mkdir,writeFile,access,copyFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const config=path.join(homedir(),'.config/obs-studio');
const scene={name:'Chatlings',current_scene:'Desktop + Chatlings',current_program_scene:'Desktop + Chatlings',scene_order:[{name:'Desktop + Chatlings'}],sources:[
 {name:'Your desktop',id:'xshm_input',versioned_id:'xshm_input',settings:{screen:0,show_cursor:true},mixers:0,enabled:true,muted:false},
 {name:'Chatlings sprites',id:'browser_source',versioned_id:'browser_source',settings:{url:'http://localhost:3010/overlay',width:960,height:480,fps:30,shutdown:false,restart_when_active:false,css:'body { background-color: rgba(0, 0, 0, 0); margin: 0; overflow: hidden; }'},mixers:0,enabled:true,muted:true},
 {name:'Desktop + Chatlings',id:'scene',versioned_id:'scene',settings:{items:[
  {name:'Your desktop',id:1,visible:true,locked:true,pos:{x:0,y:0},scale:{x:1,y:1},rot:0,alignment:5,bounds_type:2,bounds_alignment:0,bounds:{x:1920,y:1080},crop_left:0,crop_top:0,crop_right:0,crop_bottom:0},
  {name:'Chatlings sprites',id:2,visible:false,locked:false,pos:{x:0,y:120},scale:{x:2,y:2},rot:0,alignment:5,bounds_type:0,bounds_alignment:0,bounds:{x:0,y:0},crop_left:0,crop_top:0,crop_right:0,crop_bottom:0}
 ]},mixers:0}],groups:[],transitions:[],quick_transitions:[],saved_projectors:[],current_transition:'Fade',transition_duration:300,preview_locked:false,scaling_enabled:false};
await mkdir(path.join(root,'obs'),{recursive:true});
const exported=path.join(root,'obs/Chatlings_Unite.json');await writeFile(exported,JSON.stringify(scene,null,2));
if(process.argv.includes('--export-only')){console.log('Prepared OBS scene import: '+exported);process.exit(0);}
const scenes=path.join(config,'basic/scenes'),profile=path.join(config,'basic/profiles/Chatlings');await mkdir(scenes,{recursive:true});await mkdir(profile,{recursive:true});
const destination=path.join(scenes,'Chatlings_Unite.json');
try{await access(destination);if(process.argv.includes('--refresh')){await copyFile(destination,destination+'.backup-'+Date.now());await copyFile(exported,destination);console.log('Chatlings scene refreshed; previous version backed up.');}else console.log('Existing Chatlings scene preserved. Updated import file: '+exported);}catch{await copyFile(exported,destination);}
const ini='[General]\nName=Chatlings\n\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1920\nOutputCY=1080\nFPSType=0\nFPSCommon=30\n\n[Output]\nMode=Simple\n\n[SimpleOutput]\nStreamEncoder=x264\nVBitrate=4500\nRecQuality=Small\nRecFormat=mkv\n';
try{await access(path.join(profile,'basic.ini'));}catch{await writeFile(path.join(profile,'basic.ini'),ini);}
console.log('OBS scene prepared: desktop capture includes native desktop pets. Optional browser sprites are hidden to avoid duplicates.');
console.log('Preview the scene before broadcasting. No stream or recording has been started.');
const child=spawn('obs',['--profile','Chatlings','--collection','Chatlings','--scene','Desktop + Chatlings'],{detached:true,stdio:'ignore'});child.on('error',()=>console.log('Install OBS, then run this script again to open the preview.'));child.unref();
