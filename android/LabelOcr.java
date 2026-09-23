package com.wayne.componenthub;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bundled on-device model. No images are sent to the inventory server. */
public final class LabelOcr {
    private final Activity activity;
    private final WebView web;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy=new AtomicBoolean(false);
    private volatile boolean closed;
    private final TextRecognizer recognizer=TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
    public LabelOcr(Activity activity,WebView web){this.activity=activity;this.web=web;}
    @JavascriptInterface public void recognize(String data,String id){
        if(closed||id==null||!id.matches("[a-zA-Z0-9_-]{1,80}"))return;
        activity.runOnUiThread(()->{
            if(closed)return;
            String page=web.getUrl();
            if(page==null||!"https".equals(Uri.parse(page).getScheme()))return;
            if(data==null||data.length()>8000000){deliver(page,id,"","图片过大，请裁剪标签后重试");return;}
            if(!busy.compareAndSet(false,true)){deliver(page,id,"","上一张照片仍在识别，请稍后重试");return;}
            worker.execute(()->{
                Bitmap bitmap=null;
                try{
                    byte[] bytes=Base64.decode(data,Base64.DEFAULT);
                    BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
                    BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
                    if(bounds.outWidth<=0||bounds.outHeight<=0||bounds.outWidth>2400||bounds.outHeight>2400)throw new Exception("dimensions");
                    bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
                    if(bitmap==null)throw new Exception("decode");
                    final Bitmap held=bitmap;
                    recognizer.process(InputImage.fromBitmap(held,0)).addOnCompleteListener(task->{
                        try{
                            if(task.isSuccessful())deliver(page,id,task.getResult().getText(),"");
                            else deliver(page,id,"","本机识别失败，可重拍或手动填写关键参数");
                        }finally{held.recycle();busy.set(false);if(closed)recognizer.close();}
                    });
                }catch(Exception ex){if(bitmap!=null)bitmap.recycle();busy.set(false);deliver(page,id,"","照片无法读取，请换一张清晰标签照片");}
            });
        });
    }
    private void deliver(String page,String id,String text,String error){
        activity.runOnUiThread(()->{
            if(closed||activity.isFinishing()||!page.equals(web.getUrl()))return;
            try{JSONObject r=new JSONObject();r.put("id",id);r.put("text",text);r.put("error",error);r.put("engine","手机本地识别");
                web.evaluateJavascript("window.componentLabelResult&&window.componentLabelResult("+r.toString()+")",null);
            }catch(Exception ignored){}
        });
    }
    public void close(){closed=true;worker.shutdown();if(!busy.get())recognizer.close();}
}
