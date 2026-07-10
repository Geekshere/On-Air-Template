# On Air — Personal Portfolio Template

A single-page portfolio built as a car radio: drag the TUNE knob to move through sections (Home, About, Experience, Skills, Projects, Hobbies, Contact), drag VOLUME to control static/music loudness. No build step — just HTML, CSS, and vanilla JS. Deploy anywhere that serves static files (Cloudflare Pages, GitHub Pages, Netlify, etc.).

## Getting started

1. Replace every `[bracketed placeholder]` in `index.html` with your own content.
2. Add your images and audio following the conventions below.
3. Serve it through a local server while testing — **do not** just double-click `index.html`. Both the image gallery and the music system check whether files exist over a real HTTP connection, which browsers block entirely for direct `file://` access. Run:
   ```
   python3 -m http.server 8000
   ```
   then open `localhost:8000`.

## Image conventions

- **Home / About photos**: currently placeholder boxes (`<div class="placeholder-box home-photo">`). Replace with a real `<img>` tag using the same class when ready — see the CSS for `.home-photo` / `.about-photo` sizing.
- **Skill icons**: `assets/logos/[skillname].png` — referenced directly per skill, one file each.
- **Project & hobby photos**: `assets/projects/[project-slug]/1.jpg`, `assets/hobbies/[hobby-name].jpg`.

### Project image galleries

Give a project's `.image-slot` a `data-project="slug"` attribute and it becomes clickable, opening a full-resolution lightbox gallery. Drop numbered files in `assets/projects/[slug]/` — `1.jpg`, `2.jpg`, `3.png`, etc. (jpg/jpeg/png all work, and can be mixed within one project). Image `1` is also used as the card's cropped cover thumbnail. No code changes needed as you add more — the site checks sequentially and stops at the first missing number, so just don't leave gaps in the numbering.

Hobby images don't get this gallery behavior by default (no `data-project` attribute) — add one if you want that treatment somewhere else too.

## Music

Same numbered-file idea, one folder per station: `assets/audio/home/1.mp3`, `assets/audio/home/2.mp3`, etc. A random track plays when you land on that station; when it ends, another random one from the same folder plays next. No station music is required — an empty/missing folder just stays silent.

Leaving a station and coming back later resumes the track as if it had kept playing in the background the whole time (based on real elapsed time), or picks a fresh track if that math would have run past the end of the song.

## The hidden station

There's a secret station at `SECRET_FREQ` in `script.js` (currently `4.625`), reachable only by typing that exact number into the frequency input — it's intentionally not on the visible dial. It shows a rotating word + occasional beep, purely decorative. Change the number, change the word list (`secretWords` in `script.js`), or delete the whole mechanic (the `station-numbers` section in `index.html` plus its related functions in `script.js`) if it's not your thing.

## Structure

Each section in `index.html` is a `<section class="station" data-freq="NN">`. The frequency values must be whole numbers, evenly spaced, and match the JS `stations` array at the top of `script.js` exactly (`freq`, `id`, `label`) — if you add or remove a section, update both places.
