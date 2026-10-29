import {createServer} from 'vite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const root=path.resolve(process.argv[2]),scripts=process.argv.slice(3);
const server=await createServer({root,server:{host:'127.0.0.1',port:8080,strictPort:true,fs:{allow:[root]}}});await server.listen();
try{for(const script of scripts){const {stdout,stderr}=await promisify(execFile)(process.execPath,[path.resolve(script)],{cwd:root,env:{...process.env,MICHI_TEST_ORIGIN:'http://127.0.0.1:8080'},maxBuffer:8*1024*1024,timeout:300000});console.log(path.basename(script),stdout);if(stderr)console.error(stderr);}}finally{await server.close();}
