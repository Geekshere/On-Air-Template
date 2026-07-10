// ===== CHANNELS (aligned exactly to the printed scale numbers) =====
const stations = [
    { freq: 88, id: 'station-home', label: 'HOME' },
{ freq: 90, id: 'station-about', label: 'ABOUT' },
{ freq: 92, id: 'station-experience', label: 'EXPERIENCE' },
{ freq: 94, id: 'station-skills', label: 'SKILLS' },
{ freq: 96, id: 'station-projects', label: 'PROJECTS' },
{ freq: 98, id: 'station-hobbies', label: 'HOBBIES' },
{ freq: 100, id: 'station-contact', label: 'CONTACT' }
];

const SECRET_FREQ = 4.625;
const DISPLAY_MIN = 88;
const DISPLAY_MAX = 100;
const SNAP_RANGE = 0.5;
const PAD = 26;
const MINOR_TICKS_PER_GAP = 3;

const needle = document.getElementById('needle');
const freqInput = document.getElementById('freq-input');
const readoutSection = document.getElementById('readout-section');
const noSignal = document.getElementById('no-signal');
const numbersWord = document.getElementById('numbers-word');
const scaleWindow = document.getElementById('scale-window');
const scaleLabelsEl = document.getElementById('scale-labels');
const scaleTicksEl = document.getElementById('scale-ticks');

let currentFreq = 88;
let volume = 0.6;
let lockedStationId = null;
let secretActive = false;
let secretTickTimer = null;

function fracToPx(frac) {
    const width = scaleWindow.clientWidth;
    const usable = width - PAD * 2;
    return PAD + frac * usable;
}

function buildScale() {
    scaleLabelsEl.innerHTML = '';
    scaleTicksEl.innerHTML = '';

    stations.forEach((s, i) => {
        const frac = i / (stations.length - 1);
        const left = fracToPx(frac);

        const label = document.createElement('div');
        label.className = 'scale-label-item';
        label.style.left = `${left}px`;
        label.innerHTML = `<span class="label-tag">${s.label}</span><span class="label-freq">${s.freq}</span>`;
        scaleLabelsEl.appendChild(label);

        const major = document.createElement('div');
        major.className = 'tick-major';
        major.style.left = `${left}px`;
        scaleTicksEl.appendChild(major);

        if (i < stations.length - 1) {
            for (let m = 1; m <= MINOR_TICKS_PER_GAP; m++) {
                const minorFrac = (i + m / (MINOR_TICKS_PER_GAP + 1)) / (stations.length - 1);
                const minor = document.createElement('div');
                minor.className = 'tick-minor';
                minor.style.left = `${fracToPx(minorFrac)}px`;
                scaleTicksEl.appendChild(minor);
            }
        }
    });
}

function updateNeedle(freq) {
    if (secretActive) {
        needle.classList.add('hidden');
        return;
    }
    needle.classList.remove('hidden');
    const frac = (freq - DISPLAY_MIN) / (DISPLAY_MAX - DISPLAY_MIN);
    needle.style.left = `${fracToPx(frac)}px`;
}

let audioCtx = null;
let noiseSource, noiseGain;

// ===== SHARED: detect numbered sequential files (1.jpg, 2.jpg, 3.png, ...) =====
// A static host can't list a folder's contents on its own, but since these
// files follow strict numbering, we can just ask "does 1 exist? does 2
// exist?" and stop at the first gap. Used for both project image galleries
// and station music, so neither needs a manually maintained filename list.
async function detectSequentialFiles(basePath, extensions, maxTry = 30) {
    const found = [];
    for (let i = 1; i <= maxTry; i++) {
        let matched = null;
        for (const ext of extensions) {
            const url = `${basePath}/${i}.${ext}`;
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok) { matched = url; break; }
            } catch (e) {
                // network error — treat as not found
            }
        }
        if (!matched) break; // first gap in numbering means the set ends here
        found.push(matched);
    }
    return found;
}

// ===== BACKGROUND MUSIC =====
// Drop numbered files in assets/audio/[slug]/ (1.mp3, 2.mp3, ...) — no code
// changes needed as you add more, they're detected automatically the first
// time that station is visited, then cached for the rest of the session.
const stationMusic = new Audio();
stationMusic.loop = false; // handled manually so it can shuffle to a NEW track instead of repeating the same one
stationMusic.volume = 0;
let currentMusicSlug = null;
const detectedTracksCache = {};
const musicMemory = {}; // slug -> { url, position, timestamp, duration } — lets a station feel like it kept playing while you were away

async function getStationTracks(slug) {
    if (!detectedTracksCache[slug]) {
        detectedTracksCache[slug] = await detectSequentialFiles(`assets/audio/${slug}`, ['mp3']);
    }
    return detectedTracksCache[slug];
}

async function playFreshRandomTrack(slug) {
    const tracks = await getStationTracks(slug);
    if (tracks.length === 0) return;
    const chosen = tracks[Math.floor(Math.random() * tracks.length)];
    stationMusic.src = chosen;
    stationMusic.currentTime = 0;
    stationMusic.play().catch(() => {
        // No file at that path (or autoplay blocked) — fine, just stay silent
    });
}

// When a track finishes, shuffle to another one from the same station (if still tuned to it)
stationMusic.addEventListener('ended', () => {
    if (currentMusicSlug) playFreshRandomTrack(currentMusicSlug);
});

function rememberCurrentMusicPosition() {
    if (currentMusicSlug && stationMusic.src && !isNaN(stationMusic.duration)) {
        musicMemory[currentMusicSlug] = {
            url: stationMusic.src,
            position: stationMusic.currentTime,
            timestamp: Date.now(),
            duration: stationMusic.duration
        };
    }
}

async function playStationMusic(slug) {
    if (currentMusicSlug === slug) return;
    rememberCurrentMusicPosition();
    currentMusicSlug = slug;
    stationMusic.pause();
    stationMusic.volume = volume;

    const remembered = musicMemory[slug];
    if (remembered) {
        const elapsedSeconds = (Date.now() - remembered.timestamp) / 1000;
        const simulatedPosition = remembered.position + elapsedSeconds;
        if (simulatedPosition < remembered.duration) {
            // Feels like it kept playing the whole time you were tuned elsewhere
            stationMusic.src = remembered.url;
            stationMusic.currentTime = simulatedPosition;
            stationMusic.play().catch(() => {});
            return;
        }
        // The track would have finished while you were away — move on, like real radio would have
    }

    playFreshRandomTrack(slug);
}

function stopStationMusic() {
    rememberCurrentMusicPosition();
    currentMusicSlug = null;
    stationMusic.pause();
}

function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0;
    noiseSource.connect(noiseGain).connect(audioCtx.destination);
    noiseSource.start(0);
}

function noteFreq(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
}

function playChime(stationIndex) {
    if (!audioCtx) return;
    const scale = [0, 2, 4, 7, 9];
    const root = -12 + (stationIndex % 5) * 2;
    const notes = [0, 2, 4].map(i => noteFreq(root + scale[(i + stationIndex) % scale.length]));

    notes.forEach((freq, i) => {
        const t = audioCtx.currentTime + i * 0.14;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.15 * volume, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
    });
}

function playBeep() {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12 * volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
}

const secretWords = [
    'AWAIT', 'SILENCE', 'THRESHOLD', 'ECHO', 'ORCHID', 'VESSEL', 'HOLLOW',
'SEVENTEEN', 'GARDEN', 'AWAKE', 'STILL', 'MARROW', 'LATTICE', 'CIPHER',
'DORMANT', 'RELAY', 'WITNESS', 'UNSPOKEN', 'DRIFT', 'SIGNAL', 'BURIED',
'NOCTURNE', 'FRACTURE', 'HARBOR', 'WITHHELD', 'SEVERANCE', 'QUIET',
'ANTENNA', 'FORWARD', 'CONCEAL', 'PATIENCE', 'ASHEN', 'REMNANT', 'FROST',
'SENTINEL', 'ABSENT', 'CORRIDOR', 'PERIMETER', 'SUSPEND', 'KEEPER'
];
let wordHistory = [];

function pickWord() {
    const historyLimit = Math.min(6, secretWords.length - 1);
    const options = secretWords.filter(w => !wordHistory.includes(w));
    const word = options[Math.floor(Math.random() * options.length)];
    wordHistory.push(word);
    if (wordHistory.length > historyLimit) wordHistory.shift();
    return word;
}

function enterSecretStation() {
    secretActive = true;
    wordHistory = [];
    setActivePanel('station-numbers');
    noSignal.classList.remove('visible');
    readoutSection.textContent = '???';
    freqInput.value = SECRET_FREQ;
    needle.classList.add('hidden');
    stopStationMusic();
    if (noiseGain && audioCtx) noiseGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);

    const tick = () => {
        numbersWord.textContent = pickWord();
        playBeep();
        secretTickTimer = setTimeout(tick, 1400 + Math.random() * 2600);
    };
    tick();
}

function exitSecretStation() {
    secretActive = false;
    clearTimeout(secretTickTimer);
}

function findStationAt(freq) {
    return stations.find(s => s.freq === freq) || null;
}

function setActivePanel(id) {
    document.querySelectorAll('.station').forEach(el => {
        el.classList.toggle('active', el.id === id);
    });
}

function updateDisplay() {
    if (secretActive) {
        updateNeedle(currentFreq);
        return;
    }

    let nearest = stations[0];
    let minDist = Math.abs(currentFreq - nearest.freq);
    for (const s of stations) {
        const d = Math.abs(currentFreq - s.freq);
        if (d < minDist) { minDist = d; nearest = s; }
    }
    const locked = minDist <= SNAP_RANGE;
    const displayValue = locked ? nearest.freq : currentFreq;

    updateNeedle(displayValue);
    freqInput.value = locked ? nearest.freq : displayValue.toFixed(1);

    if (locked) {
        noSignal.classList.remove('visible');
        setActivePanel(nearest.id);
        readoutSection.textContent = nearest.label;
        if (lockedStationId !== nearest.id) {
            lockedStationId = nearest.id;
            playChime(stations.indexOf(nearest));
            const slug = nearest.id.replace('station-', '');
            history.replaceState(null, '', `#${slug}`);
            playStationMusic(slug);
        }
        if (noiseGain && audioCtx) noiseGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    } else {
        lockedStationId = null;
        document.querySelectorAll('.station').forEach(el => el.classList.remove('active'));
        noSignal.classList.add('visible');
        readoutSection.textContent = 'SEARCHING';
        stopStationMusic();
        if (noiseGain && audioCtx) {
            noiseGain.gain.setTargetAtTime(0.22 * volume, audioCtx.currentTime, 0.05);
        }
    }
}

function makeKnob(el, { min, max, initial, pxForFullRange, axis = 'x', onChange, onStart }) {
    const indicator = el.querySelector('.knob-indicator');
    let value = initial;
    let dragging = false;
    let startPos = 0;
    let startValue = 0;

    function render() {
        const frac = (value - min) / (max - min);
        const deg = -130 + frac * 260;
        indicator.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    }

    el.addEventListener('pointerdown', (e) => {
        if (onStart) onStart();
        dragging = true;
        startPos = axis === 'x' ? e.clientX : e.clientY;
        startValue = value;
        el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const pos = axis === 'x' ? e.clientX : e.clientY;
        const delta = axis === 'x' ? (pos - startPos) : (startPos - pos);
        const deltaValue = (delta / pxForFullRange) * (max - min);
        value = Math.max(min, Math.min(max, startValue + deltaValue));
        render();
        onChange(value);
    });

    el.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('pointercancel', () => { dragging = false; });
    el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = (max - min) / 100;
        value = Math.max(min, Math.min(max, value - Math.sign(e.deltaY) * step));
        render();
        onChange(value);
    }, { passive: false });

    render();
    return { setValue: (v) => { value = Math.max(min, Math.min(max, v)); render(); } };
}

const tuningKnob = makeKnob(document.getElementById('tuning-knob'), {
    min: DISPLAY_MIN, max: DISPLAY_MAX, initial: 88, pxForFullRange: 220, axis: 'x',
    onStart: initAudio,
    onChange: (v) => {
        if (secretActive) exitSecretStation();
        currentFreq = v;
        updateDisplay();
    }
});

makeKnob(document.getElementById('volume-knob'), {
    min: 0, max: 1, initial: 0.6, pxForFullRange: 140, axis: 'y',
    onStart: initAudio,
    onChange: (v) => {
        volume = v;
        stationMusic.volume = volume;
        if (audioCtx && noSignal.classList.contains('visible')) {
            noiseGain.gain.setTargetAtTime(0.22 * volume, audioCtx.currentTime, 0.05);
        }
    }
});

freqInput.addEventListener('focus', () => freqInput.select());

function commitInput() {
    const parsed = parseFloat(freqInput.value);
    if (!isNaN(parsed)) {
        if (Math.abs(parsed - SECRET_FREQ) < 0.001) {
            if (!secretActive) enterSecretStation();
        } else {
            if (secretActive) exitSecretStation();
            currentFreq = Math.max(DISPLAY_MIN, Math.min(DISPLAY_MAX, parsed));
            tuningKnob.setValue(currentFreq);
            updateDisplay();
        }
    }
    freqInput.blur();
}

freqInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitInput();
});
freqInput.addEventListener('blur', commitInput);

// Browsers block audio until a real user gesture happens — the page loads and
// locks onto Home immediately, so that first play() attempt gets silently
// rejected. This retries on every interaction (not just once) because track
// detection happens asynchronously in the background — an early click could
// otherwise fire before detection finishes and stationMusic has anything
// loaded yet, so this stays attached rather than giving up after one try.
function unlockAudioOnFirstInteraction() {
    initAudio();
    if (stationMusic.paused) {
        stationMusic.play().catch(() => {});
    }
}
document.addEventListener('pointerdown', unlockAudioOnFirstInteraction);
document.addEventListener('keydown', unlockAudioOnFirstInteraction);

document.getElementById('intro-modal-ok').addEventListener('click', () => {
    document.getElementById('intro-modal').classList.add('hidden');
});

window.addEventListener('resize', () => {
    buildScale();
    updateNeedle(currentFreq);
});

// ===== PROJECT IMAGE GALLERY (LIGHTBOX) =====
// Cover thumbnails default to .jpg (set directly in the HTML) but fall back
// to other extensions automatically if that guess is wrong.
document.querySelectorAll('.image-slot[data-project] img').forEach(img => {
    const slot = img.closest('.image-slot');
    const slug = slot.dataset.project;
    const extensions = ['jpg', 'jpeg', 'png'];
    let i = extensions.indexOf('jpg') + 1; // HTML already tried jpg, so start from the next one
    img.addEventListener('error', () => {
        if (i >= extensions.length) return; // out of guesses — the styled placeholder box still shows
        img.src = `assets/projects/${slug}/1.${extensions[i]}`;
        i++;
    });
});

const galleryCache = {};
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxCounter = document.getElementById('lightbox-counter');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxClose = document.getElementById('lightbox-close');

let currentGallery = [];
let currentGalleryIndex = 0;

function showLightboxImage(index) {
    currentGalleryIndex = (index + currentGallery.length) % currentGallery.length;
    lightboxImage.src = currentGallery[currentGalleryIndex];
    lightboxCounter.textContent = `${currentGalleryIndex + 1} / ${currentGallery.length}`;
}

async function openGallery(slug) {
    if (!galleryCache[slug]) {
        galleryCache[slug] = await detectSequentialFiles(`assets/projects/${slug}`, ['jpg', 'jpeg', 'png']);
    }
    currentGallery = galleryCache[slug];
    if (currentGallery.length === 0) {
        console.warn(`No images found for "${slug}" — expected assets/projects/${slug}/1.jpg (or .jpeg/.png). If you're testing by double-clicking index.html rather than through a local server, that's the likely cause.`);
        return;
    }
    lightbox.classList.add('visible');
    showLightboxImage(0);
}

function closeLightbox() {
    lightbox.classList.remove('visible');
}

document.querySelectorAll('.image-slot[data-project]').forEach(slot => {
    slot.addEventListener('click', () => openGallery(slot.dataset.project));
});

lightboxPrev.addEventListener('click', () => showLightboxImage(currentGalleryIndex - 1));
lightboxNext.addEventListener('click', () => showLightboxImage(currentGalleryIndex + 1));
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('visible')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showLightboxImage(currentGalleryIndex - 1);
    if (e.key === 'ArrowRight') showLightboxImage(currentGalleryIndex + 1);
});

buildScale();

// On load, jump straight to whatever station is in the URL hash (if any)
(function initFromHash() {
    const slug = window.location.hash.replace('#', '');
    const match = stations.find(s => s.id === `station-${slug}`);
    if (match) {
        currentFreq = match.freq;
        tuningKnob.setValue(currentFreq);
    }
})();

updateDisplay();
