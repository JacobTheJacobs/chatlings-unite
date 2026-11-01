import {inflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
const counts=[6,8,8,4,5,8,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6];
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(data){let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
// Bounded PNG decoding also rejects truncated streams and invisible/opaque atlases.
export async function validateAtlas(file){
 const data=await readFile(file);if(data.length>12*1024*1024)throw Error('Atlas must be at most 12 MB');
 if(data.length<33||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.toString('ascii',12,16)!=='IHDR')throw Error('Import the final PNG atlas');
 if(data.readUInt32BE(16)!==1536||data.readUInt32BE(20)!==4576)throw Error('Expected a 1536 × 4576 Clawmate atlas');
 const depth=data[24],type=data[25];if(![4,6].includes(type))throw Error('Atlas must support transparency (RGBA or grayscale alpha)');
 if(depth!==8||data[26]!==0||data[27]!==0||data[28]!==0)throw Error('Export a non-interlaced 8-bit PNG atlas');
 let offset=8,ended=false,header=false;const chunks=[];
 while(offset+12<=data.length){
  const len=data.readUInt32BE(offset),end=offset+12+len;if(end>data.length)throw Error('Truncated PNG chunk');
  const name=data.toString('ascii',offset+4,offset+8),chunk=data.subarray(offset+8,offset+8+len);
  if(crc32(data.subarray(offset+4,offset+8+len))!==data.readUInt32BE(offset+8+len))throw Error('Corrupt PNG checksum');
  if(name==='IHDR'){if(header||len!==13)throw Error('Invalid PNG header');header=true;}
  else if(name==='IDAT')chunks.push(chunk);
  else if(name==='IEND'){if(len!==0)throw Error('Invalid PNG end');ended=true;offset=end;break;}
  else if(name[0]===name[0].toUpperCase()&&!['PLTE'].includes(name))throw Error('Unsupported PNG critical chunk');
  offset=end;
 }
 if(!ended||offset!==data.length||!chunks.length)throw Error('Incomplete PNG atlas');
 const bpp=type===6?4:2,stride=1536*bpp,expected=(stride+1)*4576;
 let pixels;try{pixels=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});}catch{throw Error('Invalid compressed PNG pixels');}
 if(pixels.length!==expected)throw Error('Incomplete PNG pixels');
 let previous=Buffer.alloc(stride),row=Buffer.alloc(stride);const occupied=new Uint32Array(8*22);let transparent=0;
 for(let y=0;y<4576;y++){
  const start=y*(stride+1),filter=pixels[start];if(filter>4)throw Error('Invalid PNG row filter');
  for(let i=0;i<stride;i++){
   const a=i>=bpp?row[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0;
   row[i]=(pixels[start+1+i]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;
  }
  for(let x=0;x<1536;x++){if(row[x*bpp+bpp-1])occupied[Math.floor(y/208)*8+Math.floor(x/192)]++;else transparent++;}
  [previous,row]=[row,previous];
 }
 if(!transparent)throw Error('Atlas background must be transparent');
 for(let r=0;r<22;r++)for(let c=0;c<8;c++){
  if(c<counts[r]&&!occupied[r*8+c])throw Error(`Empty animation cell: row ${r}, column ${c}`);
  if(c>=counts[r]&&occupied[r*8+c])throw Error(`Unused cell must be transparent: row ${r}, column ${c}`);
 }
 return data;
}
