package com.wayne.componenthub;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bundled on-device models. No images are sent to the inventory server. */
public final class LabelOcr {
    private static final int MAX_SIDE = 2400;
    private static final int MIN_SIDE = 1500;

    private final Activity activity;
    private final WebView web;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile boolean closed;
    private final TextRecognizer chinese = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
    private final TextRecognizer latin = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

    public LabelOcr(Activity activity, WebView web) { this.activity = activity; this.web = web; }

    @JavascriptInterface
    public void recognize(String data, String id) {
        if (closed || id == null || !id.matches("[a-zA-Z0-9_-]{1,80}")) return;
        activity.runOnUiThread(() -> {
            if (closed) return;
            String page = web.getUrl();
            if (page == null || !"https".equals(Uri.parse(page).getScheme())) return;
            if (data == null || data.length() > 8000000) { deliver(page, id, "", "图片过大，请裁剪标签后重试"); return; }
            if (!busy.compareAndSet(false, true)) { deliver(page, id, "", "上一张照片仍在识别，请稍后重试"); return; }
            worker.execute(() -> {
                final Bitmap[] keep = new Bitmap[]{null, null};
                try {
                    byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                    BitmapFactory.Options bounds = new BitmapFactory.Options();
                    bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > MAX_SIDE || bounds.outHeight > MAX_SIDE) {
                        throw new Exception("dimensions");
                    }
                    keep[0] = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (keep[0] == null) throw new Exception("decode");
                    keep[1] = upscaleIfSmall(keep[0]);
                    final Bitmap input = keep[1] != null ? keep[1] : keep[0];
                    final InputImage image = InputImage.fromBitmap(input, 0);
                    // Digits and Latin ids are usually read better by the Latin model; Chinese headers by the Chinese one.
                    List<com.google.android.gms.tasks.Task<Text>> tasks = new ArrayList<>();
                    tasks.add(chinese.process(image));
                    tasks.add(latin.process(image));
                    Tasks.whenAllComplete(tasks).addOnCompleteListener(done -> {
                        String zh = textOf(tasks.get(0));
                        String en = textOf(tasks.get(1));
                        try {
                            if (zh.isEmpty() && en.isEmpty()) deliver(page, id, "", "本机识别未读到文字，请靠近标签或裁剪后重试");
                            else deliver(page, id, zh, en, "");
                        } finally {
                            recycle(keep);
                            busy.set(false);
                            if (closed) { chinese.close(); latin.close(); }
                        }
                    });
                } catch (Exception ex) {
                    recycle(keep);
                    busy.set(false);
                    deliver(page, id, "", "照片无法读取，请换一张清晰标签照片");
                }
            });
        });
    }

    private static void recycle(Bitmap[] keep) {
        for (Bitmap b : keep) if (b != null && !b.isRecycled()) b.recycle();
    }

    private static String textOf(com.google.android.gms.tasks.Task<Text> task) {
        try { return task.isSuccessful() && task.getResult() != null ? task.getResult().getText() : ""; }
        catch (Exception ignored) { return ""; }
    }

    /** Small crops lose digits; enlarge them up to a useful height while staying inside the size cap. */
    private static Bitmap upscaleIfSmall(Bitmap source) {
        int max = Math.max(source.getWidth(), source.getHeight());
        if (max >= MIN_SIDE) return null;
        float factor = Math.min(3f, (float) MIN_SIDE / max);
        int width = Math.round(source.getWidth() * factor), height = Math.round(source.getHeight() * factor);
        if (Math.max(width, height) > MAX_SIDE) return null;
        return Bitmap.createScaledBitmap(source, width, height, true);
    }

    private void deliver(String page, String id, String text, String error) { deliver(page, id, text, "", error); }

    private void deliver(String page, String id, String zh, String en, String error) {
        activity.runOnUiThread(() -> {
            if (closed || activity.isFinishing() || !page.equals(web.getUrl())) return;
            try {
                JSONArray candidates = new JSONArray();
                if (zh != null && !zh.isEmpty()) candidates.put(new JSONObject().put("engine", "中文").put("text", zh));
                if (en != null && !en.isEmpty()) candidates.put(new JSONObject().put("engine", "英文").put("text", en));
                JSONObject r = new JSONObject();
                r.put("id", id);
                r.put("text", zh == null || zh.isEmpty() ? en : zh);
                r.put("candidates", candidates);
                r.put("error", error);
                r.put("engine", "手机本地识别");
                web.evaluateJavascript("window.componentLabelResult&&window.componentLabelResult(" + r.toString() + ")", null);
            } catch (Exception ignored) {}
        });
    }

    public void close() { closed = true; worker.shutdown(); if (!busy.get()) { chinese.close(); latin.close(); } }
}
