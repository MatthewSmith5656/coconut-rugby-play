(() => {
  const canvas = document.getElementById('unity-canvas');
  const quality = document.getElementById('quality');
  const loading = document.getElementById('loading');
  const status = document.getElementById('load-status');
  const warning = document.getElementById('game-warning');
  // Opt-in diagnostic for a single page load. No cookies or saved graphics/player settings are changed.
  window.coconutCaptureEnabled = new URLSearchParams(window.location.search).get('capture') !== 'off';
  const modes = ['lowest', 'performance', 'balanced', 'sharp'];
  // A browser working without the graphics card (acceleration switched off, a blocked driver, a remote desktop)
  // draws WebGL in software: a few frames a second whatever the settings. Spot it before loading.
  const software = (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (!gl) return false;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return /swiftshader|basic render|llvmpipe|softpipe|software/i.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)));
    } catch { return false; }
  })();
  let chosen = null;
  try { chosen = localStorage.getItem('Coconut.Graphics'); } catch { }
  // Someone who picked a setting keeps it; otherwise a software-drawn browser starts on the lightest one.
  let selected = modes.includes(chosen) ? chosen : software ? 'lowest' : 'balanced';
  quality.value = selected;
  // The game reads -1 for Lowest, then 0..2 for Performance, Balanced and Sharp.
  window.coconutGraphicsMode = modes.indexOf(selected) - 1;
  const ratio = mode => mode === 'lowest' ? .5 : mode === 'performance' ? 1 : Math.min(devicePixelRatio || 1, mode === 'sharp' ? 2 : 1.5);
  const note = document.getElementById('speed-note');
  let noteDismissed = false;
  note.querySelector('button').onclick = () => { note.hidden = true; noteDismissed = true; };
  let noteTimer = 0;
  // Shown over the top of the game, out of the way of its buttons, and gone by itself after half a minute.
  const showNote = html => {
    if (noteDismissed) return;
    note.querySelector('p').innerHTML = html; note.hidden = false;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { note.hidden = true; }, 30000);
  };
  const accelerationHelp = () => {
    const agent = navigator.userAgent;
    return /Edg\//.test(agent) ? 'In Edge: <b>Settings → System and performance → Use graphics acceleration when available</b>, then restart Edge.'
      : /Firefox\//.test(agent) ? 'In Firefox: <b>Settings → General → Performance</b>, untick "Use recommended performance settings" and tick <b>Use hardware acceleration when available</b>, then restart Firefox.'
      : /Chrome\//.test(agent) ? 'In Chrome: <b>Settings → System → Use graphics acceleration when available</b>, then restart Chrome.'
      : 'Turn on <b>hardware (graphics) acceleration</b> in your browser settings, then restart it.';
  };
  if (software) showNote('<b>Your browser isn’t using your graphics card</b>, so the game will run very slowly. ' + accelerationHelp()
    + ' Updating your graphics driver can also help. Graphics is set to <b>Lowest</b> meanwhile.');
  const banner = (message, type) => {
    if (type !== 'error') { console.warn(message); return; }
    warning.textContent = 'The game could not continue. Refresh to try again. ' + message;
    warning.hidden = false;
  };
  const config = {
    dataUrl: 'Build/WebGL.data', frameworkUrl: 'Build/WebGL.framework.js', codeUrl: 'Build/WebGL.wasm',
    streamingAssetsUrl: 'StreamingAssets', companyName: 'Coconut Rugby', productName: 'Coconut Rugby',
    productVersion: '1.0', devicePixelRatio: ratio(selected), showBanner: banner
  };
  quality.onchange = () => {
    try { localStorage.setItem('Coconut.Graphics', quality.value); } catch { }
    // Apply next load, never silently disconnect someone from their current match.
    quality.title = 'Saved. Applies when you next reload the game.';
    document.getElementById('frame-status').textContent = 'Graphics saved — refresh to apply';
    pendingQuality = true;
  };
  let pendingQuality = false;
  let slowSeconds = 0;
  let ready = false, pageFocused = document.hasFocus(), unityFocused = null, latest = null;
  let measuringSince = performance.now();
  const output = document.getElementById('frame-status');
  const active = () => pageFocused && !document.hidden && unityFocused !== false;
  const drawMeter = () => {
    const now = performance.now();
    const age = latest ? Math.max(0, now - latest.at) : null;
    let state = !ready ? 'loading' : !active() ? 'inactive' : latest && age <= 3000 ? 'active'
      : !latest && now - measuringSince <= 3000 ? 'measuring' : 'waiting';
    // Diagnostic metadata makes the measurement source, focus and age explicit in a bug report.
    window.coconutPerformanceStatus = {
      source: 'Unity Update', state, sampleAgeMs: age === null ? null : Math.round(age),
      pageFocused, documentVisible: !document.hidden, unityFocused,
      fps: state === 'active' ? latest.fps : null
    };
    let text = 'Loading';
    let title = 'Game update frame rate; measured while active.';
    if (state === 'inactive') { text = 'Inactive'; title = 'Game frame rate is not being sampled while the game or page is inactive.'; }
    else if (state === 'measuring') { text = 'Measuring…'; title = 'Waiting for the first fresh game frame-rate sample.'; }
    else if (state === 'waiting') {
      text = 'Waiting for frames';
      title = 'No fresh game frame-rate sample' + (age === null ? '.' : ' for ' + (age / 1000).toFixed(1) + ' seconds.')
        + ' A previous reading is not a current frame rate.';
    } else if (state === 'active') {
      text = Math.round(latest.fps) + ' FPS' + (latest.hasLows ? ' · 1% low ' + Math.round(latest.lowFps) : '');
      title = 'Game update frame rate · ' + latest.milliseconds.toFixed(1) + ' ms per frame · Sample age ' + (age / 1000).toFixed(1) + ' s'
        + (latest.hasLows ? ' · Worst frame ' + latest.worstMs.toFixed(1)
          + ' ms · 1% low uses the slowest 1% of up to 900 recent game frames; resets on focus change.' : '');
    }
    if (!pendingQuality) output.textContent = text;
    output.title = title;
  };
  const resetMeter = () => { latest = null; slowSeconds = 0; measuringSince = performance.now(); drawMeter(); };
  window.coconutPerformanceActive = focused => { unityFocused = !!focused; resetMeter(); };
  window.addEventListener('blur', () => { pageFocused = false; resetMeter(); });
  window.addEventListener('focus', () => { pageFocused = true; resetMeter(); });
  document.addEventListener('visibilitychange', resetMeter);
  setInterval(drawMeter, 1000);
  drawMeter();
  window.coconutReportPerformance = (fps, milliseconds, lowFps, worstMs) => {
    if (!active() || !Number.isFinite(fps) || fps <= 0 || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    // Several seconds under 15 FPS: suggest the lighter settings (once).
    slowSeconds = fps < 15 ? slowSeconds + 1 : 0;
    if (slowSeconds === 8 && !software && selected !== 'lowest')
      showNote('<b>Running slowly?</b> Set <b>Graphics</b> (bottom right) to <b>Lowest</b> or <b>Performance</b> and reload. If it is still slow, check your browser is using your graphics card: ' + accelerationHelp());
    latest = { fps, milliseconds, lowFps, worstMs, at: performance.now(),
      hasLows: Number.isFinite(lowFps) && lowFps >= 0 && Number.isFinite(worstMs) && worstMs >= 0 };
    drawMeter();
  };
  const script = document.createElement('script'); script.src = 'Build/WebGL.loader.js';
  script.onerror = () => banner('Could not download the game files.', 'error');
  script.onload = () => createUnityInstance(canvas, config, progress => {
    document.getElementById('load-progress').value = progress;
    status.textContent = progress < .9 ? 'Preparing the island… ' + Math.round(progress * 100) + '%' : 'Stepping onto the pitch…';
  }).then(instance => {
    loading.hidden = true; canvas.focus(); ready = true; resetMeter();
    const fullscreen = document.getElementById('fullscreen'); fullscreen.disabled = false;
    fullscreen.onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.getElementById('unity-container').requestFullscreen) await document.getElementById('unity-container').requestFullscreen();
        else instance.SetFullscreen(1);
      } catch { fullscreen.title = 'Fullscreen is unavailable in this browser.'; }
    };
    document.addEventListener('fullscreenchange', () => {
      fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
      fullscreen.querySelector('span').textContent = document.fullscreenElement ? 'Windowed' : 'Fullscreen';
    });
  }).catch(error => banner(String(error), 'error'));
  document.body.append(script);
})();
