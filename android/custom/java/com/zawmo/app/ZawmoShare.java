package com.zawmo.app;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * «شارك ← زاومو» from the phone's gallery: photos are copied here first, then handed to Chrome
 * from this app's own FileProvider (2026-11-05: a Tecno phone's gallery shared videos fine, but
 * every photo share reached the site with nothing in it, `share arrived empty (nofile:-)` — Chrome
 * could not read the gallery's photo links that this app passed on as they were).
 *
 * Videos are left as they come (they arrive, and copying a big one here would freeze the app).
 * When a photo can't be read even here, the share says why in its text (`zawmo-share:…`), which
 * the site's service worker reports (public/sw.js), so the cause is known and not guessed.
 */
final class ZawmoShare {
    private static final int MAX = 10;

    private ZawmoShare() {}

    static Intent prepare(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return intent;
        try {
            List<Uri> uris = streams(intent);
            if (uris.isEmpty()) return withNote(intent, "nostream:" + intent.getType());
            File dir = new File(context.getCacheDir(), "shared");
            clear(dir);
            dir.mkdirs();
            ArrayList<Uri> out = new ArrayList<>();
            List<String> failed = new ArrayList<>();
            int i = 0;
            for (Uri uri : uris) {
                if (out.size() >= MAX) break;
                if (uri == null) continue;
                String type = typeOf(context, uri, intent.getType());
                if (type.startsWith("video/")) {
                    out.add(uri);
                    continue;
                }
                try {
                    File copy = new File(dir, "zawmo-" + (i++) + "." + extension(type));
                    copyTo(context, uri, copy);
                    if (copy.length() == 0) throw new IllegalStateException("empty");
                    out.add(FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", copy));
                } catch (Exception e) {
                    failed.add(uri.getScheme() + "|" + type + "|" + e.getClass().getSimpleName());
                    out.add(uri); // as before: Chrome may still read it
                }
            }
            Intent fixed = new Intent(intent);
            fixed.setClipData(null);
            if (out.size() == 1 && Intent.ACTION_SEND.equals(action)) {
                fixed.putExtra(Intent.EXTRA_STREAM, out.get(0));
            } else {
                fixed.setAction(Intent.ACTION_SEND_MULTIPLE);
                fixed.putParcelableArrayListExtra(Intent.EXTRA_STREAM, out);
            }
            fixed.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return failed.isEmpty() ? fixed : withNote(fixed, "copy:" + TextUtils.join(",", failed));
        } catch (Exception e) {
            return withNote(intent, "error:" + e.getClass().getSimpleName());
        }
    }

    // The shared files: EXTRA_STREAM (one or a list), or only the clip data (some galleries).
    @SuppressWarnings("deprecation")
    private static List<Uri> streams(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) uris.add(one);
        } else {
            ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) for (Uri u : many) if (u != null) uris.add(u);
        }
        ClipData clip = intent.getClipData();
        if (uris.isEmpty() && clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
        }
        return uris;
    }

    private static String typeOf(Context context, Uri uri, String intentType) {
        String type = null;
        try {
            type = context.getContentResolver().getType(uri);
        } catch (Exception ignored) {
        }
        if (type == null || type.isEmpty() || type.endsWith("/*")) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
            String guess = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            if (guess != null) type = guess;
        }
        if (type == null || type.isEmpty()) type = intentType != null && intentType.startsWith("video/") ? "video/*" : "image/jpeg";
        if (type.equals("image/*")) type = "image/jpeg";
        return type;
    }

    private static String extension(String type) {
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
        return ext == null || ext.isEmpty() ? "jpg" : ext;
    }

    private static void copyTo(Context context, Uri uri, File copy) throws Exception {
        try (InputStream in = context.getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(copy)) {
            if (in == null) throw new IllegalStateException("noinput");
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        }
    }

    private static void clear(File dir) {
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
    }

    // Read by public/sw.js when a share reaches the site with no file.
    private static Intent withNote(Intent intent, String note) {
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        intent.putExtra(Intent.EXTRA_TEXT, (text == null ? "" : text + " ") + "zawmo-share:" + note + " sdk" + Build.VERSION.SDK_INT);
        return intent;
    }
}
