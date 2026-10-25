'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), EventEmitter = require('node:events');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const files = new Map([['/fixture/database.json', JSON.stringify({settings: {}, devices: []})]]);
let failSave = false;
const fakeFs = {
 existsSync: name => files.has(name), readFileSync: name => files.get(name),
 writeFileSync: (name, value, options) => { if (failSave) throw Error('fixture'); assert.equal(options.mode, 0o600); files.set(name, value); },
 renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); }
};
function boot(password = 'initial-password-fixture') {
 let handler;
 vm.runInNewContext(source, {require: name => name === 'http' ? {createServer: cb => {handler = cb; return {listen() {}};}} : name === 'fs' ? fakeFs : require(name), __dirname: '/fixture', process: {env: password ? {ADMIN_PASSWORD: password} : {}}, Buffer, console: {log() {}, error() {}}});
 return (method, url, body, token) => {
  const req = new EventEmitter(); Object.assign(req, {method, url, headers: token ? {authorization: 'Bearer ' + token} : {}, socket: {remoteAddress: 'fixture'}});
  const res = {writableEnded:false, setHeader() {}, writeHead(status) {this.status=status;}, end(data) {this.data=JSON.parse(data); this.writableEnded=true;}};
  handler(req,res); if (!res.writableEnded) {req.emit('data',Buffer.from(JSON.stringify(body || {}))); req.emit('end');} return res;
 };
}
let request = boot();
const login = password => request('POST', '/api/login', {username:'admin', password});
const old = 'initial-password-fixture', next = ' new-password-fixture '; // whitespace is significant
const token = login(old).data.token, other = login(old).data.token;
const change = (currentPassword, newPassword=next, confirmPassword=newPassword, t=token) => request('POST','/api/admin/password',{currentPassword,newPassword,confirmPassword},t);
assert.equal(change(old,next,next,'bad').status,401);
assert.equal(change('wrong').status,400);
assert.equal(change(old,'short').status,400);
assert.equal(change(old,next,'different').status,400);
assert.equal(change(old,old).status,400);
failSave=true; assert.equal(change(old).status,500); failSave=false;
assert.equal(request('GET','/api/devices',null,token).status,200);
assert.equal(change(old).status,200);
const saved=JSON.parse(files.get('/fixture/admin-auth.json'));
assert.equal(saved.algorithm,'scrypt'); assert.equal(saved.hash.length,128);
assert.ok(!JSON.stringify(saved).includes(next));
assert.equal(request('GET','/api/devices',null,other).status,401);
assert.equal(request('GET','/api/devices',null,token).status,401);
assert.equal(login(old).status,401); assert.equal(login(next).status,200);
request=boot(null); assert.equal(login(old).status,401); assert.equal(login(next).status,200);
const rateToken=login(next).data.token;
for(let i=0;i<10;i++) assert.equal(change('wrong',next,next,rateToken).status,400);
assert.equal(change('wrong',next,next,rateToken).status,429);
files.set('/fixture/admin-auth.json','{"algorithm":"invalid"}');
assert.throws(()=>boot());
console.log('Passed: authenticated password changes, validation, hashing, atomic failure, session revocation, persisted restart, exact whitespace and rate limiting.');
