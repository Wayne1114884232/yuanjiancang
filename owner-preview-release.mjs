import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const PREVIEW_VERSION='2.3.1-owner-test';
export function previewReleaseInfo(){
 const bytes=fs.readFileSync(new URL('./public/downloads/component-hub-owner-preview.apk',import.meta.url));
 return {version:PREVIEW_VERSION,apkVersion:PREVIEW_VERSION,apkVersionCode:20,channel:'owner-preview',url:'/downloads/component-hub.apk',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),notes:'所有者测试：自动生成元件唯一编号；测试数据保存在电脑，电脑和 Tailscale 须保持运行。'};
}
