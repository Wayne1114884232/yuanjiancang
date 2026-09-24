import {VERSION,APK_VERSION_CODE} from '../release.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const work='D:/Codex/2026-09-10/ba/work/apk-builder',src=work+'/component-hub-webview-v2',dst=work+'/component-hub-cloud';
fs.mkdirSync(dst+'/app',{recursive:true});for(const f of ['gradlew.bat','gradlew','gradle.properties','settings.gradle','build.gradle'])fs.copyFileSync(src+'/'+f,dst+'/'+f);fs.cpSync(src+'/gradle',dst+'/gradle',{recursive:true});fs.cpSync(src+'/app/src',dst+'/app/src',{recursive:true});
let gradle=fs.readFileSync(src+'/app/build.gradle','utf8').replace("applicationId 'com.wayne.componenthub'","applicationId 'com.wayne.componenthub.team'").replace('versionCode 8','versionCode '+APK_VERSION_CODE).replace("versionName '1.7'","versionName '"+VERSION+"'");gradle=gradle.replace('minSdkVersion 21',"minSdkVersion 23\n        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' }").replace('dependencies {',"dependencies {\n    implementation 'androidx.core:core:1.9.0'\n    implementation 'com.google.mlkit:text-recognition-chinese:16.0.1'");fs.writeFileSync(dst+'/app/build.gradle',gradle);
let manifest=fs.readFileSync(dst+'/app/src/main/AndroidManifest.xml','utf8').replace('android:allowBackup="true"','android:allowBackup="false"').replace('<uses-permission android:name="android.permission.INTERNET" />','<uses-permission android:name="android.permission.INTERNET" /><uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />').replace('</application>','<provider android:name=".UpdateFileProvider" android:authorities="com.wayne.componenthub.team.updates" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_paths" /></provider></application>').replace(/\s*<intent-filter android:autoVerify="true">[\s\S]*?<\/intent-filter>/,'');fs.writeFileSync(dst+'/app/src/main/AndroidManifest.xml',manifest);
const xml=dst+'/app/src/main/res/values/strings.xml';fs.writeFileSync(xml,fs.readFileSync(xml,'utf8'));
const ip='yuanjiancang.onrender.com';
let java=fs.readFileSync(src+'/app/src/main/java/com/wayne/componenthub/MainActivity.java','utf8');
java=java.replace('private WebView webView;', 'private WebView webView;\n    private AppUpdater appUpdater;');
java=java.replace('configureWebView();','configureWebView();\n        appUpdater = new AppUpdater(this);');
java=java.replace('webView.onResume();','webView.onResume();\n        if (appUpdater != null) appUpdater.resume(APP_URL);');
java=java.replace('if (fileCallback != null) fileCallback.onReceiveValue(null);\n        webView.removeJavascriptInterface', 'if (appUpdater != null) appUpdater.close();\n        if (fileCallback != null) fileCallback.onReceiveValue(null);\n        webView.removeJavascriptInterface');
java=java.replace('private AppUpdater appUpdater;', 'private AppUpdater appUpdater;\n    private LabelOcr labelOcr;');
java=java.replace('appUpdater = new AppUpdater(this);','appUpdater = new AppUpdater(this);\n        labelOcr = new LabelOcr(this, webView);\n        webView.addJavascriptInterface(labelOcr, "LabelOcr");');
java=java.replace('if (appUpdater != null) appUpdater.close();','if (labelOcr != null) labelOcr.close();\n        webView.removeJavascriptInterface("LabelOcr");\n        if (appUpdater != null) appUpdater.close();');
java=java.replace('import android.app.Activity;','import android.app.Activity;\nimport android.app.AlertDialog;\nimport android.widget.EditText;');
java=java.replace(/private static final String APP_URL = [^;]+;/,`private String APP_URL = "https://${ip}/";`).replace(/    private static final String APP_HOST = [^;]+;\r?\n/,'');
java=java.replace('super.onCreate(savedInstanceState);','super.onCreate(savedInstanceState);\n        APP_URL = getPreferences(MODE_PRIVATE).getString("teamServer", APP_URL);\n        if (!APP_URL.startsWith("https://") || APP_URL.contains("component-hub.invalid")) APP_URL = "https://yuanjiancang.onrender.com/";');
java=java.replace('configureWebView();','configureWebView();\n        if (APP_URL.contains("component-hub.invalid")) showServerSettings();');
java=java.replace('ComponentHubAndroid/1.7','ComponentHubAndroid/'+VERSION);
java=java.replace(/if \(uri == null \|\| !"https".equalsIgnoreCase\(uri.getScheme\(\)\)\s*\|\| !APP_HOST.equalsIgnoreCase\(uri.getHost\(\)\)\) return null;/,'if (!isServerOrigin(uri)) return null;');
java=java.replace('} else if ("/app.js".equals(path)) {','} else if ("/team.css".equals(path)) {\n            asset = "team.css"; mime = "text/css";\n        } else if ("/workflows.js".equals(path)) {\n            asset = "workflows.js"; mime = "application/javascript";\n        } else if ("/app.js".equals(path)) {');
java=java.replace(/if \(\("http".equalsIgnoreCase\(scheme\) \|\| "https".equalsIgnoreCase\(scheme\)\)\s*&& APP_HOST.equalsIgnoreCase\(uri.getHost\(\)\)\) \{/,'if (isServerOrigin(uri)) {');
java=java.replace('private class AndroidDownloads {','private class AndroidDownloads {\n        @JavascriptInterface public void checkForUpdates() { runOnUiThread(() -> { if (appUpdater != null) appUpdater.check(APP_URL, true); }); }\n        @JavascriptInterface public void changeServer() { runOnUiThread(() -> showServerSettings()); }');
java=java.replace('正在运行 Tailscale 和元件仓','正在运行多人测试版，并且地址正确');
java=java.replace('电脑端元件仓和 Tailscale 正在运行','云端地址正确，免费服务可能正在启动');
java=java.replace('panel.addView(retry, buttonParams);','panel.addView(retry, buttonParams);\n        Button serverSettings = new Button(this); serverSettings.setText("修改服务器地址");\n        serverSettings.setOnClickListener(v -> showServerSettings()); panel.addView(serverSettings);');
const methods=`
    private boolean isServerOrigin(Uri uri) {
        if (uri == null) return false;
        Uri base = Uri.parse(APP_URL);
        return base.getScheme().equalsIgnoreCase(uri.getScheme())
            && base.getHost().equalsIgnoreCase(uri.getHost()) && base.getPort() == uri.getPort();
    }
    private void showServerSettings() {
        EditText input = new EditText(this); input.setSingleLine(true); input.setText(APP_URL.contains("component-hub.invalid") ? "" : APP_URL);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("元件仓连接设置")
            .setMessage("默认地址为 https://yuanjiancang.onrender.com，一般无需修改。")
            .setView(input).setNegativeButton("取消", null).setPositiveButton("保存并连接", null).create();
        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(b -> {
            try {
                Uri uri = Uri.parse(input.getText().toString().trim()); String h = uri.getHost(), scheme = uri.getScheme();
                boolean local = h != null && (h.startsWith("192.168.") || h.startsWith("10.") || h.matches("172\\\\.(1[6-9]|2[0-9]|3[01])\\\\..*"));
                if (h == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || !("https".equals(scheme) && !h.equals("component-hub.invalid"))
                    || !(uri.getPath() == null || uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new Exception();
                APP_URL = uri.buildUpon().path("/").build().toString();
                getPreferences(MODE_PRIVATE).edit().putString("teamServer", APP_URL).apply();
                webView.clearHistory(); dialog.dismiss(); loadHome();
            } catch (Exception ex) { input.setError("请填写部署成功后的完整 HTTPS 地址，不含路径和密码"); }
        })); dialog.show();
    }
`;
java=java.replace('    private FrameLayout.LayoutParams matchParent()',methods+'\n    private FrameLayout.LayoutParams matchParent()');
if(java.includes('APP_HOST'))throw Error('Unconverted origin check');fs.writeFileSync(dst+'/app/src/main/java/com/wayne/componenthub/MainActivity.java',java);
const assets='D:/Codex/2026-09-10/ba/work/component-hub-team-cloud/public';for(const f of ['index.html','app.js','styles.css','team.css','logic.js','workflows.js','qr.js','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest'])fs.copyFileSync(assets+'/'+f,dst+'/app/src/main/assets/web/'+f);
console.log('元件仓 '+VERSION+' APK prepared: https://'+ip+'/');





for(const name of ['AppUpdater.java','UpdateFileProvider.java','LabelOcr.java'])fs.copyFileSync('D:/Codex/2026-09-10/ba/work/component-hub-team-cloud/android/'+name,dst+'/app/src/main/java/com/wayne/componenthub/'+name);
fs.copyFileSync(new URL('./update_paths.xml',import.meta.url),dst+'/app/src/main/res/xml/update_paths.xml');
