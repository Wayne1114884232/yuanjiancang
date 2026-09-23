import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.2.2',APK_VERSION_CODE=14;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'优化通用标签拍照入库：支持淘宝等供应商的阻值、容量、精度、封装、数量、品牌和批次，核对后建档入库。'};}
