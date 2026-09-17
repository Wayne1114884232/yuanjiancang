package com.wayne.componenthub;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Only the verified update APK can be shared with the system installer. */
public final class UpdateFileProvider extends ContentProvider {
    public boolean onCreate(){return true;}
    private File file(Uri uri)throws FileNotFoundException{
        if(!"/latest.apk".equals(uri.getPath())||!(getContext().getPackageName()+".updates").equals(uri.getAuthority()))throw new FileNotFoundException();
        File f=new File(getContext().getCacheDir(),"component-hub-update.apk");if(!f.isFile())throw new FileNotFoundException();return f;
    }
    public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException();return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
    public String getType(Uri uri){return "application/vnd.android.package-archive";}
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){try{File f=file(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{"元件仓更新.apk",f.length()});return c;}catch(Exception e){return null;}}
    public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
    public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
