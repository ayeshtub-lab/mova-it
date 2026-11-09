package com.zawmo.app;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.Build;
import android.text.TextUtils;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
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
 *
 * 1.0.3 (2026-11-06, Sentry on his Tecno «K», Android 10, app 1.0.2: `copy:content|image/jpeg|
 * FileNotFoundException` for every photo): the gallery's photo link can't be opened as a plain
 * file. Some galleries only hand photos out as a typed stream (a provider with no files, which
 * `openInputStream` reports as FileNotFoundException), or write the file a moment after the share
 * starts. So each photo is now tried four ways (plain, typed image/*, typed any, file descriptor),
 * and once more after a short wait; when all fail, the note says which provider and what it said,
 * in a few letters (the site keeps 80 characters of it).
 *
 * 1.0.4 (2026-11-09, Sentry after 1.0.3 went live, his phone, Android 16: every photo share
 * `copy:app.fileprovider|enoent` — the link that failed was THIS app's own FileProvider). The cause,
 * read in androidbrowserhelper 2.6.2's LauncherActivity.restartInNewTask(): a share from the gallery
 * starts the app inside the gallery's task (no FLAG_ACTIVITY_NEW_TASK, or with NEW_DOCUMENT), so the
 * library starts the activity again in a task of its own with a copy of getIntent() — the intent this
 * class had already rewritten — and finishes the first one. The second start ran prepare() again: it
 * emptied the folder first (deleting the copies just made), then tried to copy its own links to those
 * deleted files: ENOENT, and Chrome got nothing. Now a link of this app's own is kept as it is (it was
 * made here, moments ago), and the folder only loses files older than an hour, never the share's own.
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
            String own = context.getPackageName() + ".fileprovider";
            // Already copied by the first start (the library's restart in a task of its own): as it is.
            boolean allOwn = true;
            for (Uri uri : uris) if (uri == null || !own.equals(uri.getAuthority())) allOwn = false;
            if (allOwn) return intent;
            File dir = new File(context.getCacheDir(), "shared");
            clearOld(dir);
            dir.mkdirs();
            long stamp = System.currentTimeMillis();
            ArrayList<Uri> out = new ArrayList<>();
            List<String> failed = new ArrayList<>();
            boolean waited = false;
            int i = 0;
            for (Uri uri : uris) {
                if (out.size() >= MAX) break;
                if (uri == null) continue;
                if (own.equals(uri.getAuthority())) {
                    out.add(uri);
                    continue;
                }
                String type = typeOf(context, uri, intent.getType());
                if (type.startsWith("video/")) {
                    out.add(uri);
                    continue;
                }
                try {
                    File copy = new File(dir, "zawmo-" + stamp + "-" + (i++) + "." + extension(type));
                    try {
                        copyTo(context, uri, copy, type);
                    } catch (FileNotFoundException late) {
                        // Written a moment after the share started: wait once (for the first such photo only).
                        if (waited) throw late;
                        waited = true;
                        Thread.sleep(700);
                        copyTo(context, uri, copy, type);
                    }
                    if (copy.length() == 0) throw new IllegalStateException("empty");
                    out.add(FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", copy));
                } catch (Exception e) {
                    if (failed.isEmpty()) failed.add(why(uri, e));
                    else failed.add("+");
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
            return failed.isEmpty() ? fixed : withNote(fixed, "copy:" + TextUtils.join("", failed));
        } catch (Exception e) {
            return withNote(intent, "error:" + e.getClass().getSimpleName());
        }
    }

    // The shared files: EXTRA_STREAM (one or a list), or only the clip data (some galleries).
    @SuppressWarnings("deprecation")
    static List<Uri> streams(Intent intent) {
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

    private static void copyTo(Context context, Uri uri, File copy, String type) throws Exception {
        try (InputStream in = open(context, uri, type); OutputStream out = new FileOutputStream(copy)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        }
    }

    // The photo's bytes, whichever way its provider gives them; the first error when none does.
    private static InputStream open(Context context, Uri uri, String type) throws Exception {
        Exception first = null;
        try {
            InputStream in = context.getContentResolver().openInputStream(uri);
            if (in != null) return in;
        } catch (Exception e) {
            first = e;
        }
        for (String mime : new String[] {type, "image/*", "*/*"}) {
            try {
                AssetFileDescriptor fd = context.getContentResolver().openTypedAssetFileDescriptor(uri, mime, null);
                if (fd != null) return fd.createInputStream();
            } catch (Exception e) {
                if (first == null) first = e;
            }
        }
        try {
            ParcelFileDescriptor pfd = context.getContentResolver().openFileDescriptor(uri, "r");
            if (pfd != null) return new ParcelFileDescriptor.AutoCloseInputStream(pfd);
        } catch (Exception e) {
            if (first == null) first = e;
        }
        if (first != null) throw first;
        throw new IllegalStateException("noinput");
    }

    // A few letters on why a photo could not be read: its provider (the last part of its name,
    // e.g. «media» or «gallery3d») and the error, shortened to a known word when there is one.
    // Never the photo's name or path.
    private static String why(Uri uri, Exception e) {
        String host = uri.getAuthority() == null ? "-" : uri.getAuthority();
        String[] parts = host.split("\\.");
        String provider = parts.length >= 2 ? parts[parts.length - 2] + "." + parts[parts.length - 1] : host;
        if (provider.length() > 24) provider = provider.substring(0, 24);
        String m = e.getMessage() == null ? "" : e.getMessage();
        String code = m.contains("No files supported") ? "nofiles"
                : m.contains("ENOENT") ? "enoent"
                : m.contains("EACCES") ? "eacces"
                : m.contains("ermission") ? "perm"
                : m.contains("No content provider") ? "noprov"
                : m.contains("No entry") || m.contains("No item") ? "noitem"
                : e.getClass().getSimpleName().replace("Exception", "");
        return provider + "|" + code;
    }

    // Copies from earlier shares (over an hour old); a share's own copies stay while Chrome reads them.
    private static void clearOld(File dir) {
        File[] old = dir.listFiles();
        long before = System.currentTimeMillis() - 60L * 60 * 1000;
        if (old != null) for (File f : old) if (f.lastModified() < before) f.delete();
    }

    // Read by public/sw.js when a share reaches the site with no file.
    private static Intent withNote(Intent intent, String note) {
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        intent.putExtra(Intent.EXTRA_TEXT, (text == null ? "" : text + " ") + "zawmo-share:" + note + " sdk" + Build.VERSION.SDK_INT);
        return intent;
    }
}
