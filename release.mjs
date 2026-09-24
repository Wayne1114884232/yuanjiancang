import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.2.5',APK_VERSION_CODE=17;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'新增 IC 标签文字点选提取、入库时间追溯、手机库存卡片、标签录入草稿恢复和云端保存状态提示。'};}
