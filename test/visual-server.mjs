// Isolated design review server. No database, credentials or production API.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'visual');
const fixtureFiles = new Set(['visual-preview.html', 'visual-preview.js', 'visual-compare.html', 'visual-mobile.html', 'visual-reference.jpeg']);
const portArg = process.argv.indexOf('--port');
const port = Number(portArg < 0 ? 4173 : process.argv[portArg + 1]);
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
http.createServer(async (req,res)=>{
  try {
    const pathname = new URL(req.url,'http://preview').pathname;
    const route = pathname === '/' ? '/visual-preview.html' : pathname;
    const base = fixtureFiles.has(route.slice(1)) ? fixtureRoot : root;
    const path = resolve(base, '.' + route);
    if (!path.startsWith(base+'/') || pathname.startsWith('/api/')) {res.writeHead(404);res.end();return;}
    const bytes = await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(bytes);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('Isolated visual fixture ready on '+port));
