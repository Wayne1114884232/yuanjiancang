import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const VERSION='2.5.2',APK_VERSION_CODE=33;
export function releaseInfo(){const file=new URL('./public/downloads/component-hub.apk',import.meta.url),bytes=fs.readFileSync(file);return {version:VERSION,apkVersion:VERSION,apkVersionCode:APK_VERSION_CODE,url:'/downloads/component-hub.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,notes:'统一拍照扫码与标签识别，安卓端本地中英文双模型与补读；修复电阻公差、毫欧、电容和电感绝对误差、晶振入库；识别结果仍需核对后提交。'};}
