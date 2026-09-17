import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.2.1',APK_VERSION_CODE=13;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'新增 APP 内升级提醒与下载安装；APP 所有者可核实身份后签发一次性账号恢复码。'};}
