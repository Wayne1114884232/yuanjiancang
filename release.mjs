import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.2.4',APK_VERSION_CODE=16;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'新增 IC 标签文字点选提取、连续拍照入库、入库时间追溯、快速领用和项目拣料单。'};}
