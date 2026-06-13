import http from "node:http";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import formidable from "formidable";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const BUILD_TIMEOUT = 5 * 60 * 1000; // 5 min timeout for builds
let isBuilding = false;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders });
  response.end(JSON.stringify(payload));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function sanitizeAppName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  return name.slice(0, 40) || "Web App";
}

function sanitizePackageName(value, appName) {
  const fallback = `com.webtoapk.${slugify(appName).replaceAll("-", "") || "app"}`;
  const packageName = String(value || fallback).trim().toLowerCase();
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(packageName) ? packageName : fallback;
}

function sanitizeColor(value) {
  const color = String(value || "#ff6b9d").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : "#FF6B9D";
}

function sanitizeUrl(value) {
  const urlStr = String(value || "").trim();
  if (!urlStr) throw new Error("Website URL is required.");
  if (urlStr.startsWith("file:///android_asset/")) return urlStr;
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only http and https URLs are supported.");
    }
    return url.href;
  } catch (e) {
    if (e.message.startsWith("Only http")) throw e;
    throw new Error(`Invalid URL "${urlStr}". Please enter a valid https:// address.`);
  }
}

function javaString(value) {
  return JSON.stringify(value);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function makeAndroidProject({
  appName,
  packageName,
  websiteUrl,
  themeColor,
  permissions = [],
  offlineFiles = [],
  orientation = "auto",
  navStyle = "standard",
  fullscreen = false,
  pullToRefresh = false,
  swipeNav = false,
  splashEnabled = true,
  splashBgColor,
  splashDuration = 2,
  splashText = "Loading...",
  customJS = "",
  versionCode = 1,
  versionName = "1.0",
  iconBase64 = null
}) {
  const packagePath = packageName.replaceAll(".", "/");
  const cleartext = websiteUrl.startsWith("http://");
  const files = new Map();

  // Handle Custom App Icon
  let customIconWritten = false;
  if (iconBase64 && iconBase64.includes(";base64,")) {
    try {
      const parts = iconBase64.split(";base64,");
      const base64Data = parts[1];
      const buffer = Buffer.from(base64Data, "base64");
      files.set("app/src/main/res/drawable/ic_launcher_foreground.png", buffer);
      customIconWritten = true;
    } catch (err) {
      console.warn("Could not parse custom icon:", err);
    }
  }

  const permMap = {
    camera: ["android.permission.CAMERA"],
    location: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"],
    mic: ["android.permission.RECORD_AUDIO"],
    storage: ["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"],
    nfc: ["android.permission.NFC"],
    vibrate: ["android.permission.VIBRATE"],
  };

  const selectedPerms = new Set(["android.permission.INTERNET"]);
  permissions.forEach(p => {
    if (permMap[p]) permMap[p].forEach(item => selectedPerms.add(item));
  });

  const permissionXml = Array.from(selectedPerms)
    .map(p => `    <uses-permission android:name="${p}" />`)
    .join("\n");

  const hardwareXml = permissions.includes("camera")
    ? '    <uses-feature android:name="android.hardware.camera" android:required="false" />'
    : "";

  for (const file of offlineFiles) {
    const parts = file.originalFilename.split("/");
    parts.shift();
    const rawPath = parts.join("/");
    const relativePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
    if (relativePath && !relativePath.startsWith("..")) {
      try {
        files.set(`app/src/main/assets/${relativePath}`, fs.readFileSync(file.filepath));
      } catch {
        console.warn(`Could not read offline file: ${relativePath}`);
      }
    }
  }

  files.set(
    ".github/workflows/build.yml",
    `name: Build Android APK
on: [push, workflow_dispatch]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: gradle

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Build with Gradle
        run: |
          gradle wrapper --gradle-version 8.9
          ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: app/build/outputs/apk/debug/app-debug.apk
`
  );

  files.set("gradlew", `#!/bin/sh
GRADLE_VERSION=8.9
APP_NAME="GradleWrapper"

# Determine where Gradle wrapper files should be
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Check if gradlew already exists in the proper location
if [ -f "\$SCRIPT_DIR/gradle/wrapper/gradle-wrapper.jar" ]; then
  exec java -jar "\$SCRIPT_DIR/gradle/wrapper/gradle-wrapper.jar" "\$@"
fi

# Try to use system gradle
if command -v gradle >/dev/null 2>&1; then
  exec gradle "\$@"
fi

echo "Error: Gradle wrapper not found."
echo "Run: gradle wrapper --gradle-version $GRADLE_VERSION"
echo "Or install gradle: sudo pacman -S gradle"
exit 1
`);

  files.set("gradle/wrapper/gradle-wrapper.properties", `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`);

  files.set(
    "README.md",
    `# ${appName}

Generated by Web-to-APK Converter.

## Build in the Cloud (Recommended)

1. Create a new repository on GitHub.
2. Upload all files from this ZIP to the repository.
3. Go to the **Actions** tab in your GitHub repository.
4. Wait for the "Build Android APK" workflow to finish.
5. Download the APK from the "Artifacts" section.

## Build Locally

1. Run \`gradle wrapper\` in this directory to download the Gradle wrapper.
2. Run \`./gradlew assembleDebug\` to build the APK.
3. Find the APK at \`app/build/outputs/apk/debug/app-debug.apk\`.

Website URL: ${websiteUrl}
Package name: ${packageName}
`
  );

  files.set("settings.gradle", `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "${appName.replaceAll('"', '\\"')}"
include ':app'
`);

  files.set("build.gradle", `plugins {
    id 'com.android.application' version '8.5.2' apply false
}
`);

  files.set("app/build.gradle", `plugins {
    id 'com.android.application'
}

android {
    namespace '${packageName}'
    compileSdk 35

    defaultConfig {
        applicationId '${packageName}'
        minSdk 23
        targetSdk 35
        versionCode ${versionCode}
        versionName '${versionName}'
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}
`);

  files.set("app/proguard-rules.pro", `# Add project specific ProGuard rules here.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
`);

  files.set("app/src/main/res/values/strings.xml", `<resources>
    <string name="app_name">${xmlEscape(appName)}</string>
</resources>
`);

  files.set("app/src/main/res/values/colors.xml", `<resources>
    <color name="theme_color">${themeColor}</color>
    <color name="theme_color_dark">#CC${themeColor.slice(1)}</color>
</resources>
`);

  const fullscreenStyle = fullscreen
    ? `        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowContentOverlay">@null</item>`
    : `        <item name="android:navigationBarColor">@color/theme_color</item>\n        <item name="android:statusBarColor">@color/theme_color</item>`;

  files.set("app/src/main/res/values/styles.xml", `<resources>
    <style name="Theme.WebToApk" parent="android:style/Theme.Material.Light.NoActionBar">
        <item name="android:fontFamily">sans-serif</item>
        <item name="android:windowLightStatusBar">false</item>
${fullscreenStyle}
        <item name="android:windowActionBar">false</item>
        <item name="android:windowNoTitle">true</item>
    </style>
</resources>
`);

  files.set("app/src/main/res/drawable/ic_launcher_background.xml", `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/theme_color" />
</shape>
`);

  files.set("app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml", `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`);

  files.set("app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml", `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`);

  if (!customIconWritten) {
    files.set("app/src/main/res/drawable/ic_launcher_foreground.xml", `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#FFFFFF" android:pathData="M26,30h56a6,6 0,0 1,6 6v36a6,6 0,0 1,-6 6H26a6,6 0,0 1,-6 -6V36a6,6 0,0 1,6 -6z"/>
    <path android:fillColor="@color/theme_color" android:pathData="M32,42h36v8H32zM32,58h44v8H32z"/>
</vector>
`);
  }

  // Splash Screen Activity
  const splashBg = splashBgColor || themeColor;
  const splashDurationMs = (splashDuration || 2) * 1000;
  const splashTextContent = splashText || "Loading...";

  if (splashEnabled) {
    files.set(`app/src/main/java/${packagePath}/SplashActivity.java`, `package ${packageName};

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.view.ViewGroup;
import android.widget.TextView;
import android.graphics.Color;

public class SplashActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView tv = new TextView(this);
        tv.setText(${javaString(splashTextContent)});
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(18);
        tv.setGravity(17);
        tv.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        tv.setBackgroundColor(Color.parseColor(${javaString(splashBg)}));

        setContentView(tv);

        new Handler(getMainLooper()).postDelayed(() -> {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
            finish();
        }, ${splashDurationMs});
    }
}
`);
  }

  // Pull-to-refresh layout
  const usePullToRefresh = pullToRefresh === true;
  const useSwipeNav = swipeNav === true;
  const useBottomNav = navStyle === "bottomnav";
  const customJSContent = customJS || "";

  // Bottom nav items
  const bottomNavLayout = useBottomNav ? `
    <LinearLayout
        android:id="@+id/bottomNav"
        android:layout_width="match_parent"
        android:layout_height="48dp"
        android:layout_alignParentBottom="true"
        android:background="@color/theme_color"
        android:gravity="center"
        android:orientation="horizontal"
        android:padding="4dp">

        <TextView
            android:id="@+id/navBack"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:gravity="center"
            android:text="◀"
            android:textColor="#fff"
            android:textSize="16dp" />

        <TextView
            android:id="@+id/navHome"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:gravity="center"
            android:text="🏠"
            android:textColor="#fff"
            android:textSize="16dp" />

        <TextView
            android:id="@+id/navForward"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:gravity="center"
            android:text="▶"
            android:textColor="#fff"
            android:textSize="16dp" />

        <TextView
            android:id="@+id/navRefresh"
            android:layout_width="0dp"
            android:layout_height="match_parent"
            android:layout_weight="1"
            android:gravity="center"
            android:text="↻"
            android:textColor="#fff"
            android:textSize="16dp" />
    </LinearLayout>` : "";

  files.set("app/src/main/res/layout/activity_main.xml", `<?xml version="1.0" encoding="utf-8"?>
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    ${useBottomNav ? `<LinearLayout
        android:id="@+id/webContainer"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:layout_above="@id/bottomNav"
        android:orientation="vertical">` : ""}

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        ${useBottomNav ? "" : 'android:layout_alignParentTop="true"'}
        ${useBottomNav ? "" : 'android:layout_alignParentBottom="true"'} />

    <ProgressBar
        android:id="@+id/progressBar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="4dp"
        ${useBottomNav ? "" : 'android:layout_alignParentTop="true"'}
        android:progressDrawable="@android:drawable/progress_horizontal"
        android:progressTint="@color/theme_color"
        android:visibility="gone" />

    ${useBottomNav ? `</LinearLayout>
    ${bottomNavLayout}` : ""}

</RelativeLayout>
`);


  const orientationAttr = (orientation && orientation !== "auto")
    ? `\n            android:screenOrientation="${orientation}"`
    : "";

  const splashActivityName = splashEnabled ? "SplashActivity" : "MainActivity";

  files.set("app/src/main/AndroidManifest.xml", `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permissionXml}
${hardwareXml}

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:theme="@style/Theme.WebToApk"
        android:usesCleartextTraffic="${cleartext}">
        <activity
            android:name=".${splashActivityName}"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <activity
            android:name=".MainActivity"
            android:configChanges="keyboardHidden|orientation|screenSize"${orientationAttr}
            android:exported="false" />
    </application>
</manifest>
`);

  const javaFullscreenSetup = fullscreen
    ? `        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }`
    : "";

  const swipeNavCode = useSwipeNav ? `
    private float startX;
    private static final int SWIPE_THRESHOLD = 100;
    private static final int SWIPE_VELOCITY_THRESHOLD = 100;

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (webView == null) return super.onTouchEvent(event);
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                startX = event.getX();
                return true;
            case MotionEvent.ACTION_UP:
                float endX = event.getX();
                float diffX = endX - startX;
                if (Math.abs(diffX) > SWIPE_THRESHOLD) {
                    if (diffX > 0 && webView.canGoBack()) {
                        webView.goBack();
                        return true;
                    } else if (diffX < 0 && webView.canGoForward()) {
                        webView.goForward();
                        return true;
                    }
                }
                return super.onTouchEvent(event);
        }
        return super.onTouchEvent(event);
    }` : "";

  const bottomNavCode = useBottomNav ? `
    private void setupBottomNav() {
        findViewById(R.id.navBack).setOnClickListener(v -> {
            if (webView.canGoBack()) webView.goBack();
        });
        findViewById(R.id.navHome).setOnClickListener(v -> {
            webView.loadUrl(START_URL);
        });
        findViewById(R.id.navForward).setOnClickListener(v -> {
            if (webView.canGoForward()) webView.goForward();
        });
        findViewById(R.id.navRefresh).setOnClickListener(v -> {
            webView.reload();
        });
    }` : "";

  const customJSInject = `
    private void injectCustomJS() {
        if (webView != null) {${customJSContent ? `
            String js = ${javaString(customJSContent)};
            if (!js.isEmpty()) {
                webView.evaluateJavascript(js, null);
            }` : ""}
        }
    }`;

  const pullToRefreshCode = usePullToRefresh ? `
    private android.widget.SwipeRefreshLayout swipeRefreshLayout;

    private void setupPullToRefresh() {
        swipeRefreshLayout = new android.widget.SwipeRefreshLayout(this);
        View originalContent = findViewById(android.R.id.content);
        ViewGroup parent = (ViewGroup) originalContent.getParent();
        parent.removeView(originalContent);
        swipeRefreshLayout.addView(originalContent);
        parent.addView(swipeRefreshLayout);
        swipeRefreshLayout.setOnRefreshListener(() -> {
            webView.reload();
        });
    }` : "";

  files.set(`app/src/main/java/${packagePath}/MainActivity.java`, `package ${packageName};

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

public class MainActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_RESULT_CODE = 1;
    private static final String START_URL = ${javaString(websiteUrl)};
${customJSInject}
${bottomNavCode}
${swipeNavCode}

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progressBar);
${javaFullscreenSetup}

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                progressBar.setProgress(0);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                ${usePullToRefresh ? "if (swipeRefreshLayout != null) { swipeRefreshLayout.setRefreshing(false); }" : ""}
                injectCustomJS();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        ${useBottomNav ? "setupBottomNav();" : ""}
        ${usePullToRefresh ? "setupPullToRefresh();" : ""}

        webView.loadUrl(START_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (filePathCallback == null) return;
            filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
`);

  return [...files.entries()].map(([name, content]) => ({
    name,
    data: content instanceof Buffer ? content : Buffer.from(content, "utf8"),
  }));
}

function normalizeProjectInput(body) {
  const appName = sanitizeAppName(body.appName);
  const websiteUrl = sanitizeUrl(body.websiteUrl);
  const packageName = sanitizePackageName(body.packageName, appName);
  const themeColor = sanitizeColor(body.themeColor);
  const permissions = Array.isArray(body.permissions) ? body.permissions : [];
  
  const orientation = ["auto", "portrait", "landscape"].includes(body.orientation) ? body.orientation : "auto";
  const navStyle = ["standard", "bottomnav"].includes(body.navStyle) ? body.navStyle : "standard";
  const fullscreen = Boolean(body.fullscreen);
  const pullToRefresh = Boolean(body.pullToRefresh);
  const swipeNav = Boolean(body.swipeNav);
  const splashEnabled = body.splashEnabled !== false;
  const splashBgColor = typeof body.splashBgColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.splashBgColor) ? body.splashBgColor.toUpperCase() : themeColor;
  const splashDuration = Math.max(1, Math.min(10, parseInt(body.splashDuration) || 2));
  const splashText = String(body.splashText || "Loading...").trim().slice(0, 50) || "Loading...";
  const customJS = typeof body.customJS === "string" ? body.customJS.trim().slice(0, 5000) : "";
  const versionCode = Math.max(1, parseInt(body.versionCode) || 1);
  const versionName = String(body.versionName || "1.0").trim().slice(0, 20) || "1.0";
  const iconBase64 = typeof body.iconBase64 === "string" && body.iconBase64.startsWith("data:image/") ? body.iconBase64 : null;

  return { appName, websiteUrl, packageName, themeColor, permissions, orientation, navStyle, fullscreen, pullToRefresh, swipeNav, splashEnabled, splashBgColor, splashDuration, splashText, customJS, versionCode, versionName, iconBase64 };
}

async function handleProjectRequest(request, response) {
  const contentType = request.headers["content-type"] || "";

  try {
    let input;
    let offlineFiles = [];

    if (contentType.includes("multipart/form-data")) {
      const form = formidable({ multiples: true });
      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(request, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      });

      if (files.files) {
        offlineFiles = Array.isArray(files.files) ? files.files : [files.files];
      }
      const config = JSON.parse(fields.config[0]);
      input = normalizeProjectInput(config);
    } else {
      const body = JSON.parse(await readRequestBody(request));
      input = normalizeProjectInput(body);
    }

    const projectFiles = makeAndroidProject({ ...input, offlineFiles });
    const zip = createZip(projectFiles);
    const filename = `${slugify(input.appName) || "web-app"}-android-project.zip`;

    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": zip.length,
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...corsHeaders,
    });
    response.end(zip);
  } catch (error) {
    console.error(error);
    sendJson(response, 400, { error: error.message || "Could not generate project." });
  }
}

async function handleApkRequest(request, response) {
  const contentType = request.headers["content-type"] || "";
  let tempDir;

  try {
    if (isBuilding) {
      sendJson(response, 429, { error: "A build is already in progress. Wait for it to finish." });
      return;
    }

    const hasJava = await commandExists("java");
    if (!hasJava) {
      sendJson(response, 400, { error: "JDK missing. Install: sudo pacman -S jdk-openjdk", requires: "jdk" });
      return;
    }

    const hasGradle = await commandExists("gradle");
    if (!hasGradle) {
      sendJson(response, 400, { error: "Gradle missing. Install: sudo pacman -S gradle", requires: "gradle" });
      return;
    }

    const androidSdk = await findAndroidSdk();
    if (!androidSdk) {
      sendJson(response, 400, { error: "Android SDK missing. Set ANDROID_HOME", requires: "sdk" });
      return;
    }

    let input;
    let offlineFiles = [];

    if (contentType.includes("multipart/form-data")) {
      const form = formidable({ multiples: true });
      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(request, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      });

      if (files.files) {
        offlineFiles = Array.isArray(files.files) ? files.files : [files.files];
      }
      const config = JSON.parse(fields.config[0]);
      input = normalizeProjectInput(config);
    } else {
      const body = JSON.parse(await readRequestBody(request));
      input = normalizeProjectInput(body);
    }

    const projectFiles = makeAndroidProject({ ...input, offlineFiles });

    tempDir = await mkdtemp(path.join(os.tmpdir(), "web-to-apk-"));
    await writeProjectFiles(tempDir, projectFiles);
    await writeFile(path.join(tempDir, "local.properties"), `sdk.dir=${androidSdk.replaceAll("\\", "\\\\")}\n`);

    isBuilding = true;
    try {
      await runCommand("gradle", ["--no-daemon", "assembleDebug"], tempDir, BUILD_TIMEOUT);
    } finally {
      isBuilding = false;
    }

    const apkPath = path.join(tempDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
    const apk = await readFile(apkPath);
    const filename = `${slugify(input.appName) || "web-app"}.apk`;

    response.writeHead(200, {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": apk.length,
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...corsHeaders,
    });
    response.end(apk);
  } catch (error) {
    console.error(error);
    sendJson(response, 400, { error: error.message || "Could not build APK." });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function pathExists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Android", "Sdk"),
    "/opt/android-sdk",
    "/usr/lib/android-sdk",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "platforms"))) {
      return candidate;
    }
  }

  return null;
}

async function writeProjectFiles(projectDir, files) {
  await Promise.all(
    files.map(async (file) => {
      const target = path.join(projectDir, file.name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.data);
    })
  );
}

async function runCommand(command, args, cwd, timeout = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timer;

    if (timeout > 0) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Command timed out after ${timeout / 1000}s`));
      }, timeout);
    }

    child.stdout.on("data", (chunk) => output += chunk.toString());
    child.stderr.on("data", (chunk) => output += chunk.toString());

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(output.trim() || `${command} exited with code ${code}`));
    });
  });
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x0021;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const checksum = crc32(file.data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(name.length),
      uint16(0),
      name,
    ]);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name,
    ]);

    localParts.push(localHeader, file.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized.startsWith("/") ? normalized.slice(1) : normalized);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === "POST" && request.url === "/api/project") {
    await handleProjectRequest(request, response);
    return;
  }

  if (request.method === "POST" && request.url === "/api/apk") {
    await handleApkRequest(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(request, response);
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`Web-to-APK Converter running at http://localhost:${port}`);
});
