/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.zawmo.app;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import java.util.ArrayList;
import java.util.List;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Zawmo: a gallery share's photos are copied first, so Chrome can read them (ZawmoShare).
        // Kept in android/custom/ — `bubblewrap update` writes this file afresh (android/README.md).
        if (savedInstanceState == null && getIntent() != null) setIntent(ZawmoShare.prepare(this, getIntent()));
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    // Zawmo 1.0.5 (2026-11-09): Chrome 153+ checks that the app opening it may read each shared file
    // before it posts them to the share target, and on Android 15+ it only knows the files named in
    // the launch intent's EXTRA_STREAM / ClipData (Chromium «Verify caller URI permissions before Web
    // Share Target in TWA»). android-browser-helper names them only inside its own share bundle, so
    // Chrome dropped every one and the site got an empty form (Sentry `share arrived empty
    // (nofile:-)`, every phone, even a single photo). So the intent that opens the browser carries the
    // shared files too, with a read grant (the fix of GoogleChromeLabs/squoosh#1503, video-shrinker#180).
    // Our own restart (androidbrowserhelper's restartInNewTask) is left as it is.
    @Override
    public void startActivity(Intent intent) {
        nameSharedFiles(intent);
        super.startActivity(intent);
    }

    @Override
    public void startActivity(Intent intent, Bundle options) {
        nameSharedFiles(intent);
        super.startActivity(intent, options);
    }

    private void nameSharedFiles(Intent out) {
        try {
            Intent in = getIntent();
            if (out == null || in == null) return;
            String action = in.getAction();
            if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
            if (out.getComponent() != null && getPackageName().equals(out.getComponent().getPackageName())) return;
            List<Uri> uris = ZawmoShare.streams(in);
            if (uris.isEmpty()) return;
            ClipData clip = ClipData.newRawUri("zawmo", uris.get(0));
            for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
            out.setClipData(clip);
            if (uris.size() == 1) out.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            else out.putParcelableArrayListExtra(Intent.EXTRA_STREAM, new ArrayList<>(uris));
            out.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
            // never stop the app from opening over this
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();

        

        return uri;
    }
}
