import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.3.0',APK_VERSION_CODE=19;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'加入批次追溯、项目拣料确认、关键元件保护、替代料实测记录、审计详情、参数对比和界面优化。正式 APK 已通过所有者测试。'};}
