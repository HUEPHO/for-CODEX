import {mkdir,open,rename,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';

const MAX_SNAPSHOT=16*1024*1024,MAX_AGE=30*60*1000;
// A single automatic checkpoint in the Steam launcher's own directory. Never
// reads or writes the ordinary local-room database and has no save browser.
export function createSteamStore(directory){
 const root=resolve(directory),path=resolve(root,'last-room.json');
 let queue=Promise.resolve();
 return {
  save(snapshot){
   const data=JSON.stringify({version:1,savedAt:Date.now(),...snapshot});
   if(Buffer.byteLength(data)>MAX_SNAPSHOT)return Promise.reject(Error('自动快照过大，操作未保存'));
   const work=queue.then(async()=>{
    await mkdir(root,{recursive:true});
    const temporary=resolve(root,'last-room.'+randomBytes(8).toString('hex')+'.tmp');
    const file=await open(temporary,'wx',0o600);
    try{await file.writeFile(data,'utf8');await file.sync();}finally{await file.close();}
    await rename(temporary,path);
   });
   queue=work.catch(()=>{});return work;
  },
  async load(){
   await queue;
   try{const raw=await readFile(path);if(raw.length>MAX_SNAPSHOT)return null;const saved=JSON.parse(raw);return saved.version===1&&Number.isFinite(saved.savedAt)&&Date.now()-saved.savedAt<=MAX_AGE?saved:null;}
   catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
  },
 };
}
