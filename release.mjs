import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.2.3',APK_VERSION_CODE=15;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'优化拍照识别：可框选单个标签，优先提取阻值、容量、精度、封装和数量；安卓 APK 使用手机本地 OCR。'};}
