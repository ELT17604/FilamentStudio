import {randomBytes,pbkdf2Sync} from 'node:crypto';
const chunks=[];
for await(const chunk of process.stdin)chunks.push(chunk);
const password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
if(!password)throw Error('请输入密码');
const salt=randomBytes(16);
console.log(['pbkdf2',100000,salt.toString('base64url'),pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64url')].join('$'));
