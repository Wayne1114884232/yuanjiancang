import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../release.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('container includes the complete local server module graph',()=>{
 const docker=fs.readFileSync(path.join(root,'Dockerfile'),'utf8');
 const copied=new Set([...docker.matchAll(/^COPY (.+) \.\/$/gm)].flatMap(m=>m[1].split(' ')));
 const visited=new Set();
 function visit(relative){if(visited.has(relative))return;visited.add(relative);
  if(!relative.includes('/'))assert.ok(copied.has(relative),`Dockerfile is missing ${relative}`);
  const text=fs.readFileSync(path.join(root,relative),'utf8');
  for(const m of text.matchAll(/from\s*['"](\.[^'"]+)['"]/g))visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative),m[1])));
 }visit('server.mjs');
});
test('formal interface loads the current version and refinement stylesheet',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 assert.ok(html.includes(`元件仓 ${VERSION}`));assert.ok(html.includes('href="refinements.css"'));
 assert.doesNotMatch(html,/name="owner-preview"|preview-ribbon/);
});
