// Vite plugin: after the build, writes the real list of built files into dist/sw.js
// and names the cache after a hash of their contents (a new build = a new cache).
import {readFileSync,writeFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative,sep} from 'node:path';

const walk=(dir,base=dir)=>readdirSync(dir).flatMap(n=>{const p=join(dir,n);
  return statSync(p).isDirectory()?walk(p,base):[relative(base,p).split(sep).join('/')]});

// Pure part (tested in tests/sw-precache.test.mjs): turns a built folder into the finished sw.js text.
export function stampServiceWorker(outDir){
  const swPath=join(outDir,'sw.js');
  if(!existsSync(swPath))throw new Error('sw-precache: '+swPath+' not found (is public/sw.js missing?)');
  const files=walk(outDir).filter(f=>f!=='sw.js'&&!f.endsWith('.map')).sort();
  const hash=createHash('sha1');for(const f of files){hash.update(f);hash.update(readFileSync(join(outDir,f)))}
  const build=hash.digest('hex').slice(0,10);
  const list=['./',...files];   // './' = the start page itself
  let sw=readFileSync(swPath,'utf8');
  if(!sw.includes('__BUILD__')||!sw.includes('/*__FILES__*/'))throw new Error('sw-precache: placeholders missing in sw.js');
  sw=sw.replace('__BUILD__',build).replace('/*__FILES__*/',list.map(f=>JSON.stringify(f)).join(','));
  writeFileSync(swPath,sw);
  return {build,files:list};
}

export function swPrecache(){
  let outDir;
  return {name:'sw-precache',apply:'build',
    configResolved(c){outDir=join(c.root,c.build.outDir)},
    closeBundle(){const r=stampServiceWorker(outDir);console.log('\nsw-precache: '+r.files.length+' files cached by habits-'+r.build)}};
}
