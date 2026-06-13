const state = {
    step: 1,
    mode: 'online',
    files: null,
    iconBase64: null,
    previewMode: 'app',
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const form = $('#converterForm');
const stepEls = $$('.step');
const dots = $$('.step-dot');
const lines = $$('.step-line');
const fill = $('#progressFill');

const sourceTabs = $$('.source-tab');
const urlPanel = $('#urlPanel');
const filePanel = $('#filePanel');
const urlInput = $('#websiteUrl');
const dropZone = $('#dropZone');
const folderInput = $('#folderInput');
const selectBtn = $('#selectBtn');
const fileBrowser = $('#fileBrowser');
const fileList = $('#fileList');
const fileCount = $('#fileCount');
const clearBtn = $('#clearFilesBtn');

const appName = $('#appName');
const pkgName = $('#packageName');
const themeColor = $('#themeColor');
const colorHex = $('#colorHex');
const phoneTop = $('#phoneTop');
const phoneName = $('#phoneName');
const phoneUrl = $('#phoneUrl');
const colorSwatches = $$('.color-swatch');

const iconInput = $('#iconInput');
const uploadIconBtn = $('#uploadIconBtn');
const clearIconBtn = $('#clearIconBtn');
const iconPreviewContainer = $('#iconPreviewContainer');
const iconPreviewPlaceholder = $('#iconPreviewPlaceholder');
const iconPreview = $('#iconPreview');

const advancedToggle = $('#advancedToggle');
const advancedContent = $('#advancedContent');
const screenOrientation = $('#screenOrientation');
const navStyle = $('#navStyle');
const appVersionName = $('#appVersionName');
const appVersionCode = $('#appVersionCode');
const fullscreenMode = $('#fullscreenMode');
const pullToRefresh = $('#pullToRefresh');
const swipeNav = $('#swipeNav');
const splashEnabled = $('#splashEnabled');
const splashBgColor = $('#splashBgColor');
const splashDuration = $('#splashDuration');
const splashText = $('#splashText');
const customJS = $('#customJS');

const previewModeTabs = $$('.preview-mode-tab');
const phoneFrame = $('#phoneFrame');
const phoneStatusbar = $('#phoneStatusbar');
const phoneScreenApp = $('#phoneScreenApp');
const phoneScreenHome = $('#phoneScreenHome');
const phoneIconCircle = $('#phoneIconCircle');
const phoneIconPlaceholder = $('#phoneIconPlaceholder');
const phoneIconImg = $('#phoneIconImg');
const launcherIconBox = $('#launcherIconBox');
const launcherIconPlaceholder = $('#launcherIconPlaceholder');
const launcherIconImg = $('#launcherIconImg');
const phoneHomeName = $('#phoneHomeName');

const urlMsg = $('#urlMsg');
const nameMsg = $('#nameMsg');
const fileMsg = $('#fileMsg');

const sumName = $('#sumName');
const sumSource = $('#sumSource');
const sumPackage = $('#sumPackage');
const sumPerms = $('#sumPerms');
const sumFeatures = $('#sumFeatures');

const buildStatus = $('#buildStatus');
const buildMsg = $('#buildMsg');
const buildApkBtn = $('#buildApkBtn');
const buildZipBtn = $('#buildZipBtn');

const toastContainer = $('#toastContainer');

function toast(message, type = 'info') {
    const icons = { success: '✓', error: '✗', info: 'i' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'i'}</span> ${message}`;
    toastContainer.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

function goToStep(n) {
    state.step = n;
    stepEls.forEach((el, i) => el.classList.toggle('active', i + 1 === n));
    dots.forEach((d, i) => {
        d.classList.toggle('active', i + 1 === n);
        d.classList.toggle('done', i + 1 < n);
    });
    lines.forEach((l, i) => l.classList.toggle('done', i + 1 < n));
    fill.style.width = `${(n / 3) * 100}%`;
}

sourceTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        state.mode = tab.dataset.mode;
        sourceTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        urlPanel.classList.toggle('hidden', state.mode !== 'online');
        filePanel.classList.toggle('hidden', state.mode !== 'offline');
        clearMsg(urlMsg);
        clearMsg(fileMsg);
    });
});

urlInput.addEventListener('input', () => {
    const v = urlInput.value.trim();
    if (!v) { showMsg(urlMsg, '', ''); return; }
    try { new URL(v); showMsg(urlMsg, 'Valid URL', 'success'); }
    catch { showMsg(urlMsg, 'Enter a valid URL (https://...)', 'error'); }
});

dropZone.addEventListener('click', () => folderInput.click());
selectBtn.addEventListener('click', (e) => { e.stopPropagation(); folderInput.click(); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
folderInput.addEventListener('change', () => {
    if (folderInput.files.length) handleFiles(folderInput.files);
});
clearBtn.addEventListener('click', () => {
    state.files = null;
    folderInput.value = '';
    resetFileUI();
    clearMsg(fileMsg);
});

function handleFiles(files) {
    state.files = files;
    if (!files.length) { resetFileUI(); return; }
    dropZone.classList.add('hidden');
    fileBrowser.classList.remove('hidden');
    fileCount.textContent = files.length;
    clearMsg(fileMsg);
    renderFileList(files);
    const first = files[0].webkitRelativePath;
    if (first && (!appName.value.trim() || appName.value === 'Web App')) {
        const folder = first.split('/')[0];
        appName.value = folder.charAt(0).toUpperCase() + folder.slice(1);
        updatePreview();
    }
}

function resetFileUI() {
    dropZone.classList.remove('hidden');
    fileBrowser.classList.add('hidden');
    fileList.innerHTML = '';
    fileCount.textContent = '0';
}

function renderFileList(files) {
    fileList.innerHTML = '';
    const arr = Array.from(files).sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath));
    const limit = 50;
    arr.slice(0, limit).forEach((f) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        const isIdx = f.name.toLowerCase() === 'index.html';
        if (isIdx) div.classList.add('is-index');
        const path = f.webkitRelativePath || f.name;
        div.innerHTML = `<span class="fi-icon">${isIdx ? '📄' : '📁'}</span><span title="${path}">${path}</span>`;
        fileList.appendChild(div);
    });
    if (arr.length > limit) {
        const more = document.createElement('div');
        more.className = 'file-item';
        more.style.opacity = '0.5';
        more.textContent = `...and ${arr.length - limit} more files`;
        fileList.appendChild(more);
    }
}

$('#step1Next').addEventListener('click', () => {
    if (state.mode === 'online') {
        const v = urlInput.value.trim();
        if (!v) { showMsg(urlMsg, 'Enter a website URL', 'error'); urlInput.focus(); return; }
        try { new URL(v); } catch { showMsg(urlMsg, 'Invalid URL format', 'error'); urlInput.focus(); return; }
    } else {
        if (!state.files || !state.files.length) {
            showMsg(fileMsg, 'Drop your website files first', 'error');
            return;
        }
    }
    goToStep(2);
    updatePreview();
});

[appName, urlInput, themeColor, appVersionName, appVersionCode, fullscreenMode, screenOrientation, navStyle, pullToRefresh, swipeNav, splashEnabled, splashBgColor, splashDuration, splashText, customJS].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', updatePreview);
    if (el.tagName === 'SELECT' || el.type === 'checkbox') {
        el.addEventListener('change', updatePreview);
    }
});

pkgName.addEventListener('input', () => { pkgName.dataset.touched = 'true'; });

colorSwatches.forEach((sw) => {
    sw.addEventListener('click', () => {
        themeColor.value = sw.dataset.color;
        updatePreview();
    });
});

uploadIconBtn.addEventListener('click', () => iconInput.click());
iconInput.addEventListener('change', () => {
    const file = iconInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        toast('Please upload an image file (PNG/JPG)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        state.iconBase64 = e.target.result;
        iconPreview.src = state.iconBase64;
        iconPreview.classList.remove('hidden');
        iconPreviewPlaceholder.classList.add('hidden');
        clearIconBtn.classList.remove('hidden');
        updatePreview();
        toast('Icon uploaded!', 'success');
    };
    reader.readAsDataURL(file);
});
clearIconBtn.addEventListener('click', () => {
    state.iconBase64 = null;
    iconInput.value = '';
    iconPreview.src = '';
    iconPreview.classList.add('hidden');
    iconPreviewPlaceholder.classList.remove('hidden');
    clearIconBtn.classList.add('hidden');
    launcherIconImg.src = '';
    launcherIconImg.classList.add('hidden');
    launcherIconPlaceholder.classList.remove('hidden');
    launcherIconPlaceholder.style.color = '';
    updatePreview();
    toast('Icon removed', 'info');
});

advancedToggle.addEventListener('click', () => {
    const isActive = advancedToggle.classList.toggle('active');
    advancedContent.classList.toggle('hidden', !isActive);
});

splashEnabled.addEventListener('change', () => {
    $('#splashSettings').classList.toggle('hidden', !splashEnabled.checked);
});

previewModeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        previewModeTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.previewMode = tab.dataset.pmode;
        phoneScreenApp.classList.toggle('hidden', state.previewMode !== 'app');
        phoneScreenHome.classList.toggle('hidden', state.previewMode !== 'home');
    });
});

function updateLauncherDate() {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', options);
    if ($('#phoneHomeDate')) {
        $('#phoneHomeDate').textContent = dateStr;
    }
}
updateLauncherDate();

function updatePreview() {
    const name = appName.value.trim() || 'Web App';
    const url = state.mode === 'online'
        ? (urlInput.value.trim() || 'https://example.com')
        : 'Local Offline App';
    const color = themeColor.value || '#ff6b9d';
    const char = name.charAt(0).toUpperCase() || 'W';

    colorHex.textContent = color.toUpperCase();

    if (state.iconBase64) {
        phoneIconImg.src = state.iconBase64;
        phoneIconImg.classList.remove('hidden');
        phoneIconPlaceholder.classList.add('hidden');
        launcherIconImg.src = state.iconBase64;
        launcherIconImg.classList.remove('hidden');
        launcherIconPlaceholder.classList.add('hidden');
        iconPreviewPlaceholder.textContent = '';
    } else {
        phoneIconImg.src = '';
        phoneIconImg.classList.add('hidden');
        phoneIconPlaceholder.classList.remove('hidden');
        phoneIconPlaceholder.textContent = char;
        phoneIconPlaceholder.style.color = color;
        launcherIconImg.src = '';
        launcherIconImg.classList.add('hidden');
        launcherIconPlaceholder.classList.remove('hidden');
        launcherIconPlaceholder.textContent = char;
        iconPreviewPlaceholder.textContent = char;
        iconPreviewPlaceholder.style.color = color;
    }

    phoneName.textContent = name;
    phoneUrl.textContent = url;
    phoneTop.style.background = color;
    launcherIconBox.style.background = color;
    phoneHomeName.textContent = name;

    const isImmersive = fullscreenMode.checked;
    phoneStatusbar.classList.toggle('hidden', isImmersive);
    phoneScreenApp.style.paddingTop = isImmersive ? '0px' : '28px';

    if (!pkgName.dataset.touched) {
        pkgName.value = `com.example.${slugify(name) || 'app'}`;
    }

    sumName.textContent = name;
    sumSource.textContent = state.mode === 'online' ? url : `Local files (${state.files?.length || 0} items)`;
    sumPackage.textContent = pkgName.value || '—';

    const checked = $$('input[name^="perm_"]:checked');
    sumPerms.textContent = checked.length
        ? Array.from(checked).map((c) => c.value.charAt(0).toUpperCase() + c.value.slice(1)).join(', ')
        : 'None';

    const features = [];
    if (splashEnabled.checked) features.push('Splash');
    if (fullscreenMode.checked) features.push('Fullscreen');
    if (pullToRefresh.checked) features.push('Pull-to-Refresh');
    if (swipeNav.checked) features.push('Swipe Nav');
    if (navStyle.value === 'bottomnav') features.push('Bottom Nav');
    if (customJS.value.trim()) features.push('Custom JS');
    sumFeatures.textContent = features.length ? features.join(' · ') : '—';

    phoneFrame.style.setProperty('--accent-glow', color + '40');

    // Update splash color preview
    const splashColor = (splashBgColor && splashBgColor.value) ? splashBgColor.value : color;
    const splashColorPreviewEl = document.getElementById('splashColorPreview');
    if (splashColorPreviewEl) splashColorPreviewEl.style.backgroundColor = splashColor;
    const splashColorHexEl = document.getElementById('splashColorHex');
    if (splashColorHexEl) splashColorHexEl.textContent = splashColor.toUpperCase();
}

function slugify(v) {
    return v.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 36);
}

function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'field-msg' + (type ? ' ' + type : '');
}

function clearMsg(el) {
    el.textContent = '';
    el.className = 'field-msg';
}

// ── PRESETS ──
const presets = {
    standard: {
        orientation: 'portrait',
        navStyle: 'standard',
        fullscreen: false,
        pullToRefresh: false,
        swipeNav: false,
        splash: true,
    },
    ecommerce: {
        orientation: 'portrait',
        navStyle: 'bottomnav',
        fullscreen: false,
        pullToRefresh: true,
        swipeNav: false,
        splash: true,
    },
    blog: {
        orientation: 'portrait',
        navStyle: 'standard',
        fullscreen: false,
        pullToRefresh: true,
        swipeNav: true,
        splash: false,
    },
    social: {
        orientation: 'portrait',
        navStyle: 'bottomnav',
        fullscreen: true,
        pullToRefresh: true,
        swipeNav: false,
        splash: true,
    },
};

$$('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const preset = presets[btn.dataset.preset];
        if (!preset) return;
        screenOrientation.value = preset.orientation;
        navStyle.value = preset.navStyle;
        fullscreenMode.checked = preset.fullscreen;
        pullToRefresh.checked = preset.pullToRefresh;
        swipeNav.checked = preset.swipeNav;
        splashEnabled.checked = preset.splash;
        $('#splashSettings').classList.toggle('hidden', !preset.splash);
        updatePreview();
        toast(`"${btn.dataset.preset.charAt(0).toUpperCase() + btn.dataset.preset.slice(1)}" preset applied`, 'success');
    });
});

// ── STEP 2 NAV ──
$('#step2Back').addEventListener('click', () => goToStep(1));
$('#step2Next').addEventListener('click', () => {
    if (!appName.value.trim()) {
        showMsg(nameMsg, 'App name is required', 'error');
        appName.focus();
        return;
    }
    clearMsg(nameMsg);
    updatePreview();
    goToStep(3);
});

$$('input[name^="perm_"]').forEach((cb) => {
    cb.addEventListener('change', updatePreview);
});

$('#step3Back').addEventListener('click', () => goToStep(2));

// ── BUILD ──
async function doBuild(endpoint, actionLabel) {
    const permissions = Array.from($$('input[name^="perm_"]:checked')).map((c) => c.value);

    const payload = {
        appName: appName.value.trim(),
        websiteUrl: state.mode === 'online' ? urlInput.value.trim() : 'file:///android_asset/index.html',
        packageName: pkgName.value.trim(),
        themeColor: themeColor.value,
        permissions,
        orientation: screenOrientation.value,
        navStyle: navStyle.value,
        versionName: appVersionName.value.trim() || '1.0',
        versionCode: parseInt(appVersionCode.value) || 1,
        fullscreen: fullscreenMode.checked,
        pullToRefresh: pullToRefresh.checked,
        swipeNav: swipeNav.checked,
        splashEnabled: splashEnabled.checked,
        splashBgColor: splashBgColor.value,
        splashDuration: parseInt(splashDuration.value) || 2,
        splashText: splashText.value.trim() || 'Loading...',
        customJS: customJS.value.trim(),
        iconBase64: state.iconBase64,
    };

    buildStatus.classList.remove('hidden');
    buildMsg.textContent = `${actionLabel}...`;
    buildApkBtn.disabled = true;
    buildZipBtn.disabled = true;

    try {
        let response;
        if (state.mode === 'offline' && state.files) {
            const fd = new FormData();
            fd.append('config', JSON.stringify(payload));
            for (const f of state.files) fd.append('files', f, f.webkitRelativePath);
            response = await fetch(endpoint, { method: 'POST', body: fd });
        } else {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Request failed');
        }

        const blob = await response.blob();
        const disp = response.headers.get('Content-Disposition') || '';
        const fn = disp.match(/filename="([^"]+)"/)?.[1] || 'output.zip';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        toast(fn.endsWith('.apk') ? 'APK downloaded! 🎉' : 'ZIP downloaded! 🎉', 'success');
        buildStatus.classList.add('hidden');
    } catch (err) {
        toast(err.message || 'Build failed', 'error');
        buildStatus.classList.add('hidden');
    } finally {
        buildApkBtn.disabled = false;
        buildZipBtn.disabled = false;
    }
}

buildApkBtn.addEventListener('click', () => doBuild('/api/apk', 'Building APK'));
buildZipBtn.addEventListener('click', () => doBuild('/api/project', 'Generating project'));

goToStep(1);
updatePreview();
toast('Welcome! Enter a URL or upload files to begin.', 'info');

// ── THEME TOGGLE ──
const themeToggle = document.getElementById('themeToggle');
const lightIcon = themeToggle.querySelector('.theme-icon-light');
const darkIcon = themeToggle.querySelector('.theme-icon-dark');
const html = document.documentElement;

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    html.setAttribute('data-theme', 'light');
    lightIcon.classList.add('hidden');
    darkIcon.classList.remove('hidden');
}

themeToggle.addEventListener('click', () => {
    const isLight = html.getAttribute('data-theme') === 'light';
    if (isLight) {
        html.removeAttribute('data-theme');
        lightIcon.classList.remove('hidden');
        darkIcon.classList.add('hidden');
        localStorage.setItem('theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        lightIcon.classList.add('hidden');
        darkIcon.classList.remove('hidden');
        localStorage.setItem('theme', 'light');
    }
});

// ── INTERACTIVE CHARACTER PHYSICS ──
const charEl = document.getElementById('walkingChar');
const charImg = document.getElementById('charImg');
const speechEl = document.getElementById('charSpeech');

if (charEl && charImg) {
    const VOICES = [
        'Hey!', 'Oii!', 'Nani?!', 'Mata ne~', 'Sugoi!', 'Yare yare...',
        'Hora!', 'Daijoubu?', 'Urusai!', 'Kuso~', 'Mou...', 'Nee?',
        'Sokka', 'Hai!', 'Subaru da!', 'Ore ga!', 'Dattebayo!',
    ];

    let vx = 2;
    let vy = 0;
    let x = 100;
    let y = typeof window !== 'undefined' ? window.innerHeight - 200 : 500;
    let dragging = false;
    let dragOffX = 0, dragOffY = 0;
    let lastMouseX = 0, lastMouseY = 0;
    let throwVx = 0, throwVy = 0;
    let grounded = false;
    let dir = 1;
    let walkTimer = 0;

    const GRAVITY = 0.6;
    const FRICTION = 0.92;
    const BOUNCE = 0.5;
    const WALK_SPEED = 2.5;
    const SIZE_W = 120;
    const SIZE_H = 160;

    function randomVoice() {
        return VOICES[Math.floor(Math.random() * VOICES.length)];
    }

    function say(text) {
        speechEl.textContent = text;
        speechEl.classList.remove('hidden');
        setTimeout(() => speechEl.classList.add('hidden'), 1800);
    }

    function updateChar() {
        charEl.style.left = x + 'px';
        charEl.style.top = y + 'px';
        charImg.style.transform = `scaleX(${dir}) scale(1.3)`;
    }

    function physicsTick() {
        if (dragging) return;

        vy += GRAVITY;

        if (!grounded && Math.abs(vy) < 0.5 && y >= window.innerHeight - SIZE_H - 20) {
            vy = 0;
            grounded = true;
        }

        // Walking AI
        walkTimer++;
        if (walkTimer > 60 + Math.random() * 120) {
            if (Math.random() < 0.3) {
                dir *= -1;
                vx = dir * WALK_SPEED;
            } else if (Math.random() < 0.3) {
                vy = -8 - Math.random() * 4;
                vx = dir * WALK_SPEED * 0.5;
                grounded = false;
                if (Math.random() < 0.5) say(randomVoice());
            } else {
                vx = dir * WALK_SPEED;
            }
            walkTimer = 0;
        }

        if (grounded && Math.random() < 0.005) {
            dir *= -1;
            vx = dir * WALK_SPEED;
        }

        x += vx;
        y += vy;

        // Wall bounce
        if (x < 0) { x = 0; vx = Math.abs(vx) * 1.2; dir = 1; if (grounded) say(randomVoice()); }
        if (x > window.innerWidth - SIZE_W) { x = window.innerWidth - SIZE_W; vx = -Math.abs(vx) * 1.2; dir = -1; if (grounded) say(randomVoice()); }

        // Floor / ceiling
        if (y > window.innerHeight - SIZE_H - 10) {
            y = window.innerHeight - SIZE_H - 10;
            if (Math.abs(vy) > 3) {
                vy = -Math.abs(vy) * BOUNCE;
                if (Math.abs(vy) < 1) {
                    vy = 0;
                    grounded = true;
                }
            } else {
                vy = 0;
                grounded = true;
            }
        }
        if (y < 0) { y = 0; vy = Math.abs(vy) * 0.5; }

        // Walking animation
        if (grounded && Math.abs(vx) > 0.5) {
            charImg.style.animation = 'walkBounce 0.3s ease-in-out infinite alternate';
        } else if (!grounded) {
            charImg.style.animation = 'none';
            charImg.style.transform = `scaleX(${dir}) scale(1.3) rotate(${vx * 2}deg)`;
        } else {
            charImg.style.animation = 'none';
        }

        updateChar();
        requestAnimationFrame(physicsTick);
    }

    // Mouse events
    charEl.addEventListener('mousedown', (e) => {
        dragging = true;
        const rect = charEl.getBoundingClientRect();
        dragOffX = e.clientX - rect.left;
        dragOffY = e.clientY - rect.top;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        vx = 0;
        vy = 0;
        say(randomVoice());
        charEl.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        throwVx = e.clientX - lastMouseX;
        throwVy = e.clientY - lastMouseY;
        x = e.clientX - dragOffX;
        y = e.clientY - dragOffY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        grounded = false;
        updateChar();
        dir = throwVx > 0 ? 1 : -1;
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            vx = throwVx * 0.8;
            vy = throwVy * 0.8;
            throwVx = 0;
            throwVy = 0;
            if (Math.abs(vx) > 5 || Math.abs(vy) > 5) {
                say('Whoa!!');
            }
            charEl.style.cursor = 'grab';
        }
    });

    // Touch support
    charEl.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        dragging = true;
        const rect = charEl.getBoundingClientRect();
        dragOffX = touch.clientX - rect.left;
        dragOffY = touch.clientY - rect.top;
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
        vx = 0;
        vy = 0;
        say(randomVoice());
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const touch = e.touches[0];
        throwVx = touch.clientX - lastMouseX;
        throwVy = touch.clientY - lastMouseY;
        x = touch.clientX - dragOffX;
        y = touch.clientY - dragOffY;
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
        grounded = false;
        updateChar();
        dir = throwVx > 0 ? 1 : -1;
    }, { passive: false });

    document.addEventListener('touchend', () => {
        if (dragging) {
            dragging = false;
            vx = throwVx * 0.8;
            vy = throwVy * 0.8;
            if (Math.abs(vx) > 5 || Math.abs(vy) > 5) {
                say('Whoa!!');
            }
            charEl.style.cursor = 'grab';
        }
    });

    // Click for voice
    charEl.addEventListener('click', () => {
        if (!dragging) say(randomVoice());
    });

    // Init position
    x = Math.random() * (window.innerWidth - 200);
    y = window.innerHeight - SIZE_H - 20;
    updateChar();
    setTimeout(() => say('Ore wa Subaru da!'), 500);
    physicsTick();
}
