package com.wayne.componenthub;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.ClipData;
import androidx.core.content.FileProvider;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Checks the configured server; never installs silently or accepts a web-supplied APK URL. */
public final class AppUpdater {
    private final Activity activity;
    private final SharedPreferences prefs;
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile boolean closed;
    private long lastCheck;
    private boolean awaitingPermission;
    private AlertDialog prompt;
    private ProgressDialog progress;
    public AppUpdater(Activity owner) { activity=owner; prefs=owner.getSharedPreferences("app-updates",0); }
    private boolean alive() { return !closed && !activity.isFinishing() && (Build.VERSION.SDK_INT<17 || !activity.isDestroyed()); }
    private void ui(Runnable action) { activity.runOnUiThread(() -> {if(alive()) action.run();}); }
    private void notice(String message) { ui(() -> Toast.makeText(activity,message,Toast.LENGTH_LONG).show()); }
    private int currentCode() throws Exception {return activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionCode;}
    private HttpsURLConnection open(String address) throws Exception {
        URL url=new URL(address); if(!"https".equals(url.getProtocol()))throw new IOException("更新地址须为 HTTPS");
        HttpsURLConnection c=(HttpsURLConnection)url.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(20000);c.setReadTimeout(65000);c.setUseCaches(false);c.setRequestProperty("Cache-Control","no-cache");c.setRequestProperty("Accept","application/json, application/vnd.android.package-archive");
        if(c.getResponseCode()!=200){c.disconnect();throw new IOException("服务暂时不可用，请稍后重试");}return c;
    }
    public void check(String base, boolean manual) {
        if(!alive() || (prompt!=null&&prompt.isShowing()))return;
        if(!manual&&System.currentTimeMillis()-lastCheck<6*3600000L)return;
        if(!busy.compareAndSet(false,true)){if(manual)notice("正在检查或下载更新");return;}
        lastCheck=System.currentTimeMillis();
        new Thread(() -> {
            try {
                String origin=base.endsWith("/")?base.substring(0,base.length()-1):base;
                HttpsURLConnection c=open(origin+"/api/version");ByteArrayOutputStream out=new ByteArrayOutputStream();
                try(InputStream in=c.getInputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>65536)throw new IOException("更新信息过大");out.write(b,0,n);}}finally{c.disconnect();}
                JSONObject release=new JSONObject(out.toString("UTF-8"));int code=release.getInt("apkVersionCode");
                if(code<=currentCode()){if(manual)notice("当前已是最新版本");return;}
                if(!"/downloads/component-hub.apk".equals(release.getString("url")))throw new IOException("更新地址不正确");
                String hash=release.getString("sha256");long size=release.getLong("size");
                if(!hash.matches("[a-fA-F0-9]{64}")||size<=0||size>32*1024*1024)throw new IOException("更新校验信息不完整");
                if(!manual&&prefs.getInt("laterCode",0)==code&&System.currentTimeMillis()<prefs.getLong("laterUntil",0))return;
                ui(() -> {prompt=new AlertDialog.Builder(activity).setTitle("发现新版本 "+release.optString("apkVersion"))
                    .setMessage(release.optString("notes")+"\n\n点击更新后将在 APP 内下载，完成后打开安卓安装确认。原账号和库存保留。")
                    .setNegativeButton("稍后提醒",(d,w)->prefs.edit().putInt("laterCode",code).putLong("laterUntil",System.currentTimeMillis()+86400000L).apply())
                    .setNeutralButton("浏览器下载",(d,w)->browserDownload(origin,release))
                    .setPositiveButton("立即更新",(d,w)->download(origin,release)).create();prompt.setCanceledOnTouchOutside(false);prompt.show();});
            }catch(Exception ex){if(manual)notice("检查更新失败："+ex.getMessage());}
            finally{busy.set(false);}
        },"hub-update-check").start();
    }
    private File updateDir(){File dir=new File(activity.getFilesDir(),"updates");if(!dir.isDirectory()&&!dir.mkdirs())throw new IllegalStateException("无法创建更新目录");return dir;}
    private File apkFile(){return new File(updateDir(),"component-hub-update.apk");}
    private void browserDownload(String origin,JSONObject release){
        try{Uri uri=Uri.parse(origin+"/downloads/component-hub.apk").buildUpon().appendQueryParameter("v",release.optString("sha256")).build();activity.startActivity(new Intent(Intent.ACTION_VIEW,uri));}
        catch(Exception e){notice("无法打开浏览器，请用手机浏览器打开元件仓下载地址");}
    }
    private static String digest(File file)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[16384];int n;while((n=in.read(b))!=-1)md.update(b,0,n);}StringBuilder s=new StringBuilder();for(byte b:md.digest())s.append(String.format("%02x",b&255));return s.toString();}
    private void verify(File file,String hash,int code)throws Exception{
        if(!digest(file).equalsIgnoreCase(hash))throw new IOException("安装包校验失败，请重新下载");
        PackageManager pm=activity.getPackageManager();PackageInfo incoming=pm.getPackageArchiveInfo(file.getPath(),PackageManager.GET_SIGNATURES),installed=pm.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
        if(incoming==null||!activity.getPackageName().equals(incoming.packageName)||incoming.versionCode!=code||code<=installed.versionCode)throw new IOException("安装包版本或应用身份不匹配");
        Signature[] a=incoming.signatures,b=installed.signatures;
        if(a==null||b==null||a.length!=b.length||a.length==0)throw new IOException("安装包签名不匹配");
        for(int i=0;i<a.length;i++)if(!Arrays.equals(a[i].toByteArray(),b[i].toByteArray()))throw new IOException("安装包签名不匹配");
    }
    private void download(String origin,JSONObject release){
        if(!busy.compareAndSet(false,true))return;
        progress=new ProgressDialog(activity);progress.setTitle("正在下载更新");progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);progress.setMax(100);progress.setCancelable(false);progress.show();
        new Thread(()->{File temp=null;
            try{temp=new File(updateDir(),"component-hub-update.part");long expected=release.getLong("size");HttpsURLConnection c=open(origin+"/downloads/component-hub.apk?v="+release.getString("sha256"));
                try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(temp)){byte[] b=new byte[16384];int n;long count=0;while((n=in.read(b))!=-1){if(closed)throw new IOException("下载已中断");count+=n;if(count>expected||count>32*1024*1024)throw new IOException("安装包大小不匹配");out.write(b,0,n);int percent=(int)(count*100/expected);ui(()->progress.setProgress(percent));}if(count!=expected)throw new IOException("下载不完整，请重试");}finally{c.disconnect();}
                verify(temp,release.getString("sha256"),release.getInt("apkVersionCode"));File target=apkFile();if(target.exists()&&!target.delete())throw new IOException("无法替换旧安装包");if(!temp.renameTo(target))throw new IOException("无法保存更新");
                prefs.edit().putString("hash",release.getString("sha256")).putInt("code",release.getInt("apkVersionCode")).apply();
                ui(()->{progress.dismiss();install();});
            }catch(Exception ex){if(temp!=null)temp.delete();ui(()->{progress.dismiss();new AlertDialog.Builder(activity).setTitle("更新未完成").setMessage(ex.getMessage()+"。现有版本仍可使用，请在“我的 → 检查更新”重试。").setNeutralButton("浏览器下载",(d,w)->browserDownload(origin,release)).setPositiveButton("知道了",null).show();});}
            finally{busy.set(false);}
        },"hub-update-download").start();
    }
    private void install(){
        try{
            verify(apkFile(),prefs.getString("hash",""),prefs.getInt("code",0));
            if(Build.VERSION.SDK_INT>=26&&!activity.getPackageManager().canRequestPackageInstalls()){
                new AlertDialog.Builder(activity).setTitle("允许安装元件仓更新").setMessage("首次更新需要在安卓设置中允许“元件仓”安装应用。返回后将继续打开安装确认。").setNegativeButton("稍后",null).setPositiveButton("去设置",(d,w)->{try{awaitingPermission=true;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}catch(Exception e){awaitingPermission=false;notice("无法打开安装权限设置");}}).show();return;
            }
            Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",apkFile());
            Intent intent=new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri,"application/vnd.android.package-archive");
            intent.setClipData(ClipData.newRawUri("元件仓更新",uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
        }catch(Exception ex){notice("无法打开安装确认："+ex.getMessage());}
    }
    public void resume(String base){if(awaitingPermission){awaitingPermission=false;install();}else check(base,false);}
    public void close(){closed=true;if(prompt!=null)prompt.dismiss();if(progress!=null)progress.dismiss();}
}
