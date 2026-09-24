import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.3.1',APK_VERSION_CODE=20;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'手动新增元件支持自动生成唯一编号；同步测试版与正式版的元件编号规则。'};}
