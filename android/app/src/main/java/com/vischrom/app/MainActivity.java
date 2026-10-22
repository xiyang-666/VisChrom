package com.vischrom.app;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Bundled local content only. No network permission, service or remote endpoint. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 100, SAVE_FILE = 101;
    private static final String ORIGIN = "appassets.androidplatform.net";
    private WebView webView;
    private ValueCallback<Uri[]> chooserCallback;
    private Uri cameraUri;
    private File cameraFile;
    private byte[] pendingExport;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245,245,239));
        setContentView(webView);
        webView.setOnApplyWindowInsetsListener((view,insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSupportMultipleWindows(false);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                if (isLocal(request.getUrl())) {
                    WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                    if (response != null) return response;
                }
                return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) { return !isLocal(request.getUrl()); }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if (chooserCallback != null) chooserCallback.onReceiveValue(null);
                chooserCallback = callback;
                cleanCamera();
                try {
                    if (params.isCaptureEnabled()) {
                        Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        if (capture.resolveActivity(getPackageManager()) != null) {
                            File directory = new File(getCacheDir(),"camera");
                            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Cannot prepare camera");
                            cameraFile = File.createTempFile("vischrom-",".jpg",directory);
                            cameraUri = FileProvider.getUriForFile(MainActivity.this,getPackageName()+".files",cameraFile);
                            capture.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);
                            capture.setClipData(ClipData.newRawUri("Photo",cameraUri));
                            capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            startActivityForResult(capture,PICK_FILE);
                            return true;
                        }
                        Toast.makeText(MainActivity.this,"未找到相机，改为选择图片",Toast.LENGTH_SHORT).show();
                    }
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    String[] accepted = params.getAcceptTypes();
                    pick.setType(accepted.length > 0 && accepted[0].contains("json") ? "application/json" : "image/*");
                    startActivityForResult(pick,PICK_FILE);
                } catch (Exception error) {
                    chooserCallback.onReceiveValue(null);chooserCallback = null;
                    cleanCamera();
                    Toast.makeText(MainActivity.this,"无法打开文件选择器，请使用手动选色",Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });
        webView.addJavascriptInterface(new LocalExport(),"AndroidBridge");
        webView.loadUrl("https://"+ORIGIN+"/assets/index.html");
    }

    private boolean isLocal(Uri uri) { return "https".equals(uri.getScheme()) && ORIGIN.equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/assets/"); }
    private void cleanCamera() { if(cameraFile != null) cameraFile.delete();cameraFile = null;cameraUri = null; }

    public final class LocalExport {
        @JavascriptInterface public void exportText(String name,String mime,String text) {
            if(text == null || text.length() > 2_000_000) return;
            if(!"application/json".equals(mime) && !"image/svg+xml".equals(mime)) return;
            final String filename = "application/json".equals(mime) ? "vischrom-backup.json" : "vischrom-palette.svg";
            runOnUiThread(() -> {
                if(pendingExport != null) return;
                pendingExport = text.getBytes(StandardCharsets.UTF_8);
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.addCategory(Intent.CATEGORY_OPENABLE);save.setType(mime);save.putExtra(Intent.EXTRA_TITLE,filename);
                try { startActivityForResult(save,SAVE_FILE); }
                catch(Exception error) {pendingExport = null;Toast.makeText(MainActivity.this,"无法打开保存位置",Toast.LENGTH_LONG).show();}
            });
        }
    }

    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request == PICK_FILE && chooserCallback != null) {
            Uri selected = result == RESULT_OK ? (cameraUri != null ? cameraUri : data != null ? data.getData() : null) : null;
            chooserCallback.onReceiveValue(selected != null ? new Uri[]{selected} : null);
            chooserCallback = null;
            // WebView decodes asynchronously; remove the temporary photo after decoding time.
            File completed = cameraFile;cameraFile = null;cameraUri = null;
            if(completed != null)webView.postDelayed(completed::delete,60_000);
        }
        if(request == SAVE_FILE) {
            final byte[] bytes = pendingExport;pendingExport = null;
            if(result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try(OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if(output == null)throw new IllegalStateException("No output");output.write(bytes);
                    Toast.makeText(this,"文件已保存",Toast.LENGTH_SHORT).show();
                } catch(Exception error) {Toast.makeText(this,"文件保存失败，请重试",Toast.LENGTH_LONG).show();}
            }
        }
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()",value->{if(!"true".equals(value))MainActivity.super.onBackPressed();});
    }
    @Override protected void onDestroy() {
        if(chooserCallback != null)chooserCallback.onReceiveValue(null);
        cleanCamera();webView.removeJavascriptInterface("AndroidBridge");webView.destroy();super.onDestroy();
    }
}
