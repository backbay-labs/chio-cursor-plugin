#!/usr/bin/env node
// Probe the exact SBPL retained by a real Cursor HTTP discovery run.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {join, isAbsolute} from 'node:path';
const [state, configPath, output] = process.argv.slice(2);
if (![state, configPath, output].every(value => value && isAbsolute(value))) throw new Error('Absolute retained state, operator configuration and new output required');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const policyPath = join(state, 'control/profile.sb');
const policy = readFileSync(policyPath, 'utf8');
const ports = [...policy.matchAll(/localhost:(\d+)/g)].map(match => Number(match[1]));
if (ports.length !== 1) throw new Error('Expected one parent-only route');
let connections = 0;
const listener = createServer(socket => { connections++; socket.destroy(); });
await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(ports[0], '127.0.0.1', resolve); });
const source = `const fs=require('fs'),net=require('net');
const paths=${JSON.stringify({config:configPath,journal:config.journalDir,control:join(state,'control/profile.sb'),state:join(state,'data/boundary-canary')})};
const result={};function attempt(name,fn){try{fn();result[name]='allowed'}catch(e){result[name]=e.code}}
attempt('operatorConfig',()=>fs.readFileSync(paths.config));
attempt('journalRead',()=>fs.readdirSync(paths.journal));
attempt('journalWrite',()=>fs.writeFileSync(paths.journal+'/boundary-forbidden','must not exist',{flag:'wx'}));
attempt('controlWrite',()=>fs.openSync(paths.control,'r+'));
attempt('privateStateWrite',()=>fs.writeFileSync(paths.state,'isolated state'));
function tcp(port){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port});let done=false;function end(v){if(done)return;done=true;s.destroy();resolve(v)}s.setTimeout(1500);s.on('connect',()=>end('allowed'));s.on('error',()=>end('blocked'));s.on('timeout',()=>end('blocked'))})}
Promise.all([tcp(${ports[0]}),tcp(${Number(new URL(config.execution.endpoint).port)})]).then(([parent,kernel])=>{result.network={parent,kernel};console.log(JSON.stringify(result))});`;
async function run(code) {
 const child = spawn('/usr/bin/sandbox-exec',['-f',policyPath,process.execPath,'-e',code],{cwd:join(state,'workspace'),env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',OPENSSL_CONF:'/dev/null',TMPDIR:join(state,'data/tmp')},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderr+=data});
 const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
 return {status,stderr,facts:stdout.trim()?JSON.parse(stdout):null};
}
try {
 const direct=await run(source);
 const descendant=await run(`const r=require('child_process').spawnSync(process.execPath,['-e',${JSON.stringify(source)}],{encoding:'utf8'});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status??1;`);
 const passed=[direct,descendant].every(r=>r.status===0&&['operatorConfig','journalRead','journalWrite','controlWrite'].every(k=>r.facts?.[k]==='EPERM')&&r.facts.privateStateWrite==='allowed'&&r.facts.network.parent==='allowed'&&r.facts.network.kernel==='blocked')&&connections===2;
 writeFileSync(output,JSON.stringify({passed,policySha256:createHash('sha256').update(policy).digest('hex'),retainedCursorState:state,configurationSha256:createHash('sha256').update(readFileSync(configPath)).digest('hex'),direct,descendant,independentParentConnections:connections,claim:'actual retained host profile probes, not authenticated model acceptance'},null,2)+'\n',{flag:'wx',mode:0o600});
 if(!passed)process.exitCode=1;
} finally { await new Promise(resolve=>listener.close(resolve)); }
