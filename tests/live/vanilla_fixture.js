import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function waitFor(check,timeout=30000,detail=()=> '') {
    const started=Date.now();
    while(!check()) {
        if(Date.now()-started>timeout) throw new Error(`Timed out: ${detail()}`);
        await delay(50);
    }
}
export async function vanillaFixture(port=55918) {
    const dir=path.resolve(`server_data/agent-verification-${Date.now()}`);
    const jar=path.resolve(process.env.MC_TEST_SERVER_JAR||'server_data/local-test/server.jar');
    if(!existsSync(jar)) throw new Error('Set MC_TEST_SERVER_JAR to a Minecraft Java 1.21.11 server jar');
    mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'eula.txt'),'eula=true\n');
    writeFileSync(path.join(dir,'server.properties'),`server-ip=127.0.0.1\nserver-port=${port}\nonline-mode=false\nenforce-secure-profile=false\nlevel-type=minecraft:flat\ngamemode=survival\ndifficulty=peaceful\nspawn-protection=0\nview-distance=3\nsimulation-distance=3\nmax-tick-time=120000\npause-when-empty-seconds=0\n`);
    const server=spawn(process.env.MC_TEST_JAVA||'/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
        ['-Djava.net.preferIPv4Stack=true','-Xms256M','-Xmx1G','-jar',jar,'nogui'],{cwd:dir,stdio:['pipe','pipe','pipe']});
    let log='';server.stdout.on('data',data=>{log+=data;});server.stderr.on('data',data=>{log+=data;});
    await waitFor(()=>log.includes('Done ('),90000,()=>log.slice(-1800));
    return {dir,port,get log(){return log;},command:async text=>{server.stdin.write(`${text}\n`);await delay(180);},
        stop:async()=>{
            if(server.exitCode!==null) return;
            server.stdin.write('stop\n');const timer=setTimeout(()=>server.kill('SIGTERM'),15000);
            await once(server,'exit');clearTimeout(timer);
        }};
}
