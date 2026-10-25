'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EventEmitter = require('node:events');
const root = path.join(__dirname, '..');
let handler, failSave = false, corrupt = false;
let db = { settings: { trialDays: 0 }, devices: [{ id: 'fixture', mac: '00:11:22:33:44:55', deviceKey: '123456', status: 'active', expireDate: '2099-01-01', playlist: {server: 'https://fixture.invalid', username: 'dummy', password: 'dummy'} }] };
const fakeFs = {
    existsSync: name => !name.endsWith('admin-auth.json'),
    readFileSync: () => corrupt ? '{' : JSON.stringify(db),
    writeFileSync: (_, value) => { if (failSave) throw new Error('fixture failure'); fakeFs.pending = value; },
    renameSync: () => { db = JSON.parse(fakeFs.pending); },
    realpathSync: value => value,
    readFile: (_, cb) => cb(null, Buffer.from('fixture'))
};
const context = { require: name => name === 'http' ? { createServer: cb => { handler = cb; return { listen() {} }; } } : name === 'fs' ? fakeFs : require(name), __dirname: '/fixture/panel', process: { env: { ADMIN_PASSWORD: 'fixture-password-only' } }, console: { log() {}, error() {} }, Buffer };
vm.runInNewContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context, { timeout: 1000 });
function request(method, url, body, token) {
    const req = new EventEmitter();
    Object.assign(req, { method, url, headers: token ? { authorization: 'Bearer ' + token } : {}, socket: { remoteAddress: 'fixture' } });
    const res = { headersSent: false, writableEnded: false, status: 0, setHeader() {}, writeHead(status) { this.status = status; this.headersSent = true; }, end(value) { this.value = value; this.writableEnded = true; } };
    handler(req, res);
    if (!res.writableEnded) { if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))); req.emit('end'); }
    return { status: res.status, data: (() => { try { return JSON.parse(res.value); } catch { return res.value; } })() };
}
for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal(request(method, method === 'PUT' || method === 'DELETE' ? '/api/devices/fixture' : '/api/devices', {}).status, 401);
assert.equal(request('POST', '/api/login', {username: 'admin', password: 'admin123'}).status, 401);
const login = request('POST', '/api/login', {username: 'admin', password: 'fixture-password-only'});
assert.equal(login.status, 200);
const token = login.data.token;
assert.match(token, /^[a-f0-9]{64}$/);
assert.equal(request('GET', '/api/devices', undefined, token).status, 200);
for (const route of ['/../database.json', '/%2e%2e/database.json', '/%2e%2e%2fdatabase.json', '/%5c..%5cdatabase.json']) assert.equal(request('GET', route).status, 403);
assert.equal(request('GET', '/api/check?mac=00:11:22:33:44:55&key=999999').status, 403);
const check = request('GET', '/api/check?mac=00:11:22:33:44:55&key=123456');
assert.equal(check.status, 200);
assert.equal(check.data.playlist.username, 'dummy');
assert.equal(check.data.deviceKey, undefined);
assert.equal(request('GET', '/api/check?mac=00:11:22:33:44:66&key=123456').status, 403);
assert.equal(request('POST', '/api/devices', { mac: 'bad' }, token).status, 400);
assert.equal(request('POST', '/api/devices/bulk', { macList: [null] }, token).status, 400);
assert.equal(request('POST', '/api/devices', 'null', token).status, 400);
assert.equal(request('POST', '/api/devices', 'x'.repeat(65537), token).status, 413);
assert.equal(request('PUT', '/api/devices/fixture', { extendYears: 'invalid' }, token).status, 400);
assert.equal(request('PUT', '/api/devices/fixture', { expireDate: 'invalid' }, token).status, 400);
failSave = true;
assert.equal(request('POST', '/api/devices', {mac: '00:11:22:33:44:77'}, token).status, 500);
failSave = false;
corrupt = true;
assert.equal(request('GET', '/api/devices', undefined, token).status, 500);
corrupt = false;
request('POST', '/api/logout', {}, token);
assert.equal(request('GET', '/api/devices', undefined, token).status, 401);

console.log('Passed: panel authentication, device keys, validation, traversal and persistence failures.');
