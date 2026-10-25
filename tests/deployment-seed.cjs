'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), EventEmitter = require('node:events');
const source = fs.readFileSync(__dirname + '/../server.js', 'utf8');
const seedPath = '/etc/secrets/aziza-database-seed.json';
const dbPath = '/fixture/database.json';
const seed = {admin:{password:'must-not-be-copied'},settings:{appName:'fixture restored'},devices:[{id:'fixture-device'}]};
const files = new Map([[seedPath,JSON.stringify(seed)]]);
let handler;
const mockFs = {existsSync:p=>files.has(p),readFileSync:p=>files.get(p),writeFileSync:(p,v)=>files.set(p,v),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
vm.runInNewContext(source,{require:n=>n==='http'?{createServer:cb=>{handler=cb;return{listen(){}};}}:n==='fs'?mockFs:require(n),process:{env:{ADMIN_PASSWORD:'fixture-password-only'}},__dirname:'/fixture',Buffer,console:{log(){},error(){}}});
function login(){const req=new EventEmitter();Object.assign(req,{url:'/api/login',method:'POST',headers:{},socket:{remoteAddress:'fixture'}});const res={writableEnded:false,setHeader(){},writeHead(n){this.status=n;},end(s){this.data=JSON.parse(s);this.writableEnded=true;}};handler(req,res);req.emit('data',Buffer.from(JSON.stringify({username:'admin',password:'fixture-password-only'})));req.emit('end');return res;}
assert.equal(login().status,200);
let saved=JSON.parse(files.get(dbPath));assert.equal(saved.settings.appName,'fixture restored');assert.equal(saved.devices[0].id,'fixture-device');assert.equal(saved.admin,undefined);
saved.devices.push({id:'later-device'});files.set(dbPath,JSON.stringify(saved));files.set(seedPath,'invalid');assert.equal(login().status,200);assert.equal(JSON.parse(files.get(dbPath)).devices.length,2);
files.delete(dbPath);assert.equal(login().status,500);assert.equal(files.has(dbPath),false);
files.delete(seedPath);assert.equal(login().status,200);assert.equal(JSON.parse(files.get(dbPath)).devices.length,0);
console.log('Passed: private seed restoration, removal of legacy admin, preservation of existing data, invalid-seed failure and clean first setup.');
