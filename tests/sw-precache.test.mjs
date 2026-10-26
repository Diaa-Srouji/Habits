// Tests for the build step that writes the cache list into the service worker.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {stampServiceWorker} from '../tools/sw-precache.mjs';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
// A fake `dist/` folder: the real public/sw.js plus a few built files.
function fakeDist(extra={}){
  const d=mkdtempSync(join(tmpdir(),'dist-'));mkdirSync(join(d,'assets'));
  cpSync(join(ROOT,'public','sw.js'),join(d,'sw.js'));
  const files={'index.html':'<html>','manifest.json':'{}','icon.svg':'<svg/>','assets/index-abc123.js':'console.log(1)','assets/index-abc123.css':'body{}','assets/index-abc123.js.map':'{}',...extra};
  for(const [f,c] of Object.entries(files))writeFileSync(join(d,f),c);
  return d}
// Run the finished sw.js in a sandbox and read the constants it declares.
const readSW=d=>{const ctx={self:{addEventListener(){}},caches:{},location:{origin:'x'},URL};vm.createContext(ctx);
  vm.runInContext(readFileSync(join(d,'sw.js'),'utf8')+';this.out={BUILD,FILES,C}',ctx);return ctx.out};

test('every built file is listed, plus the start page',()=>{
  const d=fakeDist(),{files}=stampServiceWorker(d),sw=readSW(d);
  assert.deepEqual([...sw.FILES],files);
  for(const f of ['./','index.html','manifest.json','icon.svg','assets/index-abc123.js','assets/index-abc123.css'])assert.ok(sw.FILES.includes(f),f+' missing');
});
test('the service worker itself and source maps are not cached',()=>{
  const d=fakeDist(),sw=(stampServiceWorker(d),readSW(d));
  assert.ok(!sw.FILES.includes('sw.js'));assert.ok(!sw.FILES.some(f=>f.endsWith('.map')));
});
test('the cache name carries the build hash and the placeholders are gone',()=>{
  const d=fakeDist(),{build}=stampServiceWorker(d),text=readFileSync(join(d,'sw.js'),'utf8'),sw=readSW(d);
  assert.match(build,/^[0-9a-f]{10}$/);assert.equal(sw.C,'habits-'+build);
  assert.ok(!text.includes('__BUILD__')&&!text.includes('__FILES__'));
});
test('same build gives the same name, changed content gives a new one',()=>{
  const a=stampServiceWorker(fakeDist()).build,b=stampServiceWorker(fakeDist()).build,c=stampServiceWorker(fakeDist({'assets/index-abc123.js':'console.log(2)'})).build;
  assert.equal(a,b);assert.notEqual(a,c);
});
test('stamping fails loudly if the placeholders were already replaced',()=>{
  const d=fakeDist();stampServiceWorker(d);assert.throws(()=>stampServiceWorker(d),/placeholders missing/);
});
test('the manifest only points at files that exist in public/',()=>{
  const m=JSON.parse(readFileSync(join(ROOT,'public','manifest.json'),'utf8'));
  for(const i of m.icons)assert.doesNotThrow(()=>readFileSync(join(ROOT,'public',i.src)),i.src);
  assert.ok(m.icons.some(i=>i.sizes==='192x192')&&m.icons.some(i=>i.sizes==='512x512')&&m.icons.some(i=>i.purpose==='maskable'));
  assert.equal(m.display,'standalone');assert.ok(m.name&&m.short_name&&m.start_url);
});
