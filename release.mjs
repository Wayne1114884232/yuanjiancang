import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.2.6',APK_VERSION_CODE=18;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'改进 APP 内更新的安装文件交接和读取授权，新增浏览器下载备用入口。旧版内更新失败时，请先用手机浏览器下载并覆盖安装本版。'};}
