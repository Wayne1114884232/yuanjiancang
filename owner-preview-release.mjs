import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const PREVIEW_VERSION='2.3.0-owner-test';
export function previewReleaseInfo(){
 const bytes=fs.readFileSync(new URL('./public/downloads/component-hub-owner-preview.apk',import.meta.url));
 return {version:PREVIEW_VERSION,apkVersion:PREVIEW_VERSION,apkVersionCode:19,channel:'owner-preview',url:'/downloads/component-hub.apk',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),notes:'所有者测试：批次追溯、项目拣料、替代料实测记录、关键元件确认及界面优化。测试数据保存在电脑，电脑和 Tailscale 须保持运行。'};
}
