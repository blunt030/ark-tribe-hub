import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

test('Community APIs: permissions, isolation, persistence and rate limits', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ath-community-'));
  let app = await startServer(path.join(dir, 'test.db'), 0, { rateLimits: { globalMax: 100000, authMax: 100000 } });
  t.after(async () => { await new Promise(r => app.server.close(r)); await app.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = () => `http://localhost:${app.port}`;
  function client() {
    let cookie, csrf;
    return async (method, url, body, noCsrf = false) => {
      const res = await fetch(base()+url, { method, headers: { 'Content-Type':'application/json', ...(cookie ? { Cookie:cookie } : {}), ...(csrf && !noCsrf ? { 'X-CSRF-Token':csrf } : {}) }, body:body === undefined ? undefined : JSON.stringify(body) });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      const data = await res.json();
      if (data.csrfToken) csrf=data.csrfToken;
      return { status:res.status, ...data };
    };
  }
  const admin=client(), member=client(), dev=client(), anon=client(), pending=client(), outsider=client();
  for (const [c,identifier] of [[admin,'OaO Admin'],[member,'Blunt OaO'],[dev,'Blunt']]) assert.equal((await c('POST','/api/auth/login',{identifier,password:'ChangeMe123!'})).status,200);
  const oao = await app.db.get("SELECT id FROM tribes WHERE slug='oao'");
  const other = await app.db.get("INSERT INTO tribes (slug,name) VALUES ('other','Other') RETURNING id");
  // Local fixtures avoid any outbound mail and exercise real login/session checks.
  const template = await app.db.get("SELECT password_hash FROM users WHERE username='Blunt OaO'");
  for (const [name,tribeId,status] of [['Pending',oao.id,'pending_approval'],['Other admin',other.id,'active']]) {
    const u = await app.db.get('INSERT INTO users (username,tribe_id,password_hash,status) VALUES (?,?,?,?) RETURNING id',[name,tribeId,template.password_hash,status]);
    await app.db.run("INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE key='admin'",[u.id]);
  }
  for (const [c,identifier] of [[pending,'Pending'],[outsider,'Other admin']]) assert.equal((await c('POST','/api/auth/login',{identifier,password:'ChangeMe123!'})).status,200);
  const payload={name:'Friendly Tribe',relationship:'alliance',server:'EU 123',map:'The Island'};
  let allianceId;
  await t.test('Auth, approval, own tribe and CSRF required',async()=>{
    for (const url of ['/api/alliances','/api/chat/messages']) {
      assert.equal((await anon('GET',url)).status,401);
      assert.equal((await pending('GET',url)).status,403);
      assert.equal((await dev('GET',url)).status,403);
    }
    assert.equal((await member('POST','/api/chat/messages',{body:'x'},true)).status,403);
    assert.equal((await admin('POST','/api/alliances',payload,true)).status,403);
    assert.equal((await member('POST','/api/alliances',payload)).status,403);
  });
  await t.test('Admin CRUD, member reading, scoped mutation and audit',async()=>{
    const r=await admin('POST','/api/alliances',payload); assert.equal(r.status,201); allianceId=r.alliance.id;
    assert.equal((await member('GET','/api/alliances')).alliances.length,1);
    assert.deepEqual((await outsider('GET','/api/alliances')).alliances,[]);
    assert.equal((await outsider('PATCH','/api/alliances/'+allianceId,payload)).status,404);
    assert.equal((await outsider('DELETE','/api/alliances/'+allianceId)).status,404);
    assert.equal((await member('PATCH','/api/alliances/'+allianceId,payload)).status,403);
    assert.equal((await member('DELETE','/api/alliances/'+allianceId)).status,403);
    assert.equal((await admin('PATCH','/api/alliances/'+allianceId,{...payload,relationship:'friend'})).alliance.relationship,'friend');
    assert.ok((await app.db.all("SELECT * FROM audit_logs WHERE action='alliance_updated'")).length);
  });
  await t.test('Input validation rejects malformed, empty and oversized values',async()=>{
    for(const body of ['', ' '.repeat(5), 'x'.repeat(2001), {}, 123, null]) assert.equal((await member('POST','/api/chat/messages',{body})).status,400);
    for(const body of [null, [], {...payload,name:123}, {...payload,relationship:'invalid'}, {...payload,map:'x'.repeat(101)}]) assert.equal((await admin('POST','/api/alliances',body)).status,400);
    for(const q of ['limit=101','limit=0','after=-1','before=1&after=2','after=abc']) assert.equal((await member('GET','/api/chat/messages?'+q)).status,400);
  });
  await t.test('Concurrent sending is limited to 10/minute, with literal text and tribe isolation',async()=>{
    const results=await Promise.all(Array.from({length:14},(_,i)=>member('POST','/api/chat/messages',{body:i===0?'<img src=x onerror=alert(1)>':`message ${i}`})));
    assert.equal(results.filter(r=>r.status===201).length,10);
    assert.equal(results.filter(r=>r.status===429).length,4);
    assert.deepEqual((await outsider('GET','/api/chat/messages')).messages,[]);
    assert.ok((await admin('GET','/api/chat/messages')).messages.some(m=>m.body==='<img src=x onerror=alert(1)>'));
    assert.equal((await admin('POST','/api/chat/messages',{body:'different author'})).status,201);
  });
  await t.test('Stable ascending cursor pages have no duplicate or omitted messages',async()=>{
    const all=(await member('GET','/api/chat/messages')).messages;
    const latest=await member('GET','/api/chat/messages?limit=3'); assert.equal(latest.hasMore,true);
    assert.deepEqual(latest.messages.map(m=>m.id),all.slice(-3).map(m=>m.id));
    const previous=await member('GET',`/api/chat/messages?before=${latest.messages[0].id}&limit=100`);
    assert.deepEqual([...previous.messages,...latest.messages].map(m=>m.id),all.map(m=>m.id));
    const next=await member('GET',`/api/chat/messages?after=${all[0].id}&limit=3`);
    assert.deepEqual(next.messages.map(m=>m.id),all.slice(1,4).map(m=>m.id)); assert.equal(next.hasMore,true);
    assert.deepEqual((await outsider('GET',`/api/chat/messages?after=${all[0].id}`)).messages,[]);
  });
  await t.test('Developer with own tribe is still scoped to that tribe',async()=>{
    await app.db.run("UPDATE users SET tribe_id=? WHERE username='Blunt'",[other.id]);
    assert.deepEqual((await dev('GET','/api/chat/messages')).messages,[]);
    assert.deepEqual((await dev('GET','/api/alliances')).alliances,[]);
    assert.equal((await dev('DELETE','/api/alliances/'+allianceId)).status,404);
    await app.db.run("UPDATE users SET tribe_id=NULL WHERE username='Blunt'");
  });
  await t.test('Existing DB reopen preserves community and old data, including rate limit',async()=>{
    const oldCount=await app.db.get('SELECT COUNT(*) AS n FROM items');
    await new Promise(r=>app.server.close(r)); await app.db.close();
    app=await startServer(path.join(dir,'test.db'),0,{rateLimits:{globalMax:100000,authMax:100000}});
    assert.equal((await member('GET','/api/chat/messages')).messages.length,11);
    assert.equal((await member('POST','/api/chat/messages',{body:'still limited'})).status,429);
    assert.equal((await member('GET','/api/alliances')).alliances[0].id,allianceId);
    assert.equal((await app.db.get('SELECT COUNT(*) AS n FROM items')).n,oldCount.n);
    assert.equal((await admin('DELETE','/api/alliances/'+allianceId)).status,200);
    assert.deepEqual((await member('GET','/api/alliances')).alliances,[]);
  });
  await t.test('Bundled images are real PNG responses',async()=>{
    const source=readFileSync(new URL('../public/js/icons.js',import.meta.url),'utf8');
    const keys=[...source.match(/const MITGELIEFERT = new Set\(\[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
    for(const key of keys) {
      const res=await fetch(base()+'/assets/'+key+'.png'); assert.equal(res.headers.get('content-type'),'image/png');
      const bytes=new Uint8Array(await res.arrayBuffer()); assert.equal(bytes[0],137); assert.equal(bytes[1],80);
    }
  });
});

test('Nodemailer renders a local multipart message without sending mail',async()=>{
  const {default:nodemailer}=await import('nodemailer');
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  const result=await transport.sendMail({from:'support@example.test',to:'recipient@example.test',subject:'ARK test',text:'Test',html:'<p>Test</p>'});
  assert.match(result.message.toString(),/multipart\/alternative/);
  assert.match(result.message.toString(),/Subject: ARK test/);
});
