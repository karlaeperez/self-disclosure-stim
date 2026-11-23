# Specs for the voice studies

Settings for the stimulus videos, the recorded audio and the analysis, for these studies
(`self-descriptions/`, `other-descriptions/`) and future ones like them.

## 1. Stimulus videos

| Setting | Use | Avoid |
|---|---|---|
| Container | `.mp4` | `.mov`, `.mkv` |
| Video codec | **H.264**, "High" profile | HEVC/H.265 (Firefox can't play it), ProRes |
| Bit depth / colour | **8-bit, 4:2:0** (`yuv420p`) | **10-bit and 4:2:2**: they made videos freeze in Firefox |
| Resolution | **1280×720** (the study displays videos at most 640 px wide) | 1080p or 4K: bigger files, no visible benefit |
| Frame rate | Constant **30 or 60 fps** (30 unless motion matters; smaller files) | Variable frame rate, if the editor lets you choose |
| Audio | AAC, 48 kHz, ~128 kbps, **same loudness in every video** | Mixed loudness between videos |
| Layout | "Fast start" (`+faststart`) | |
| File names | Keep each name exactly the same when replacing a file, with no spaces | Renaming: the study looks files up by name |

**Can a video play before it has fully loaded?** In these studies, every video is downloaded into
memory in the background during consent, the mic check and the warm-up. A loading screen waits
before Part 1 if anything is still downloading, so videos never stream mid-trial. If a download
fails, the video streams from the server instead, and it can only start before fully loading if it
was saved with fast start.

Cloudflare Pages (the host) allows at most 25 MB per file.

**One command that produces all of this,** including evening out the loudness:

```
ffmpeg -i input.mov -vf scale=1280:720 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 -preset slow \
  -c:a aac -b:a 128k -ar 48000 -af loudnorm=I=-16:TP=-1.5:LRA=11 -movflags +faststart output.mp4
```

Add `-r 30` to convert to 30 fps.

**To check a file:**

```
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt,width,height,avg_frame_rate -of csv=p=0 file.mp4
```

It should print something like `h264,High,yuv420p,1280,720,60/1`.

## 2. Recorded audio

### How the audio arrives

- **One continuous recording per participant.** It starts when the first stimulus video starts and
  stops after the last trial.
- **Uploaded in pieces of at most 1 MB** (DataPipe rejects uploads somewhere between 2 and 3.4 MB).
  The pieces arrive in Google Drive as `<file name>_part01of03.webm`, `_part02of03.webm`, etc.
- **Joining the pieces:** joining them in order gives back the exact original file. Only part 1
  plays on its own.

  ```
  cat <file name>_part*.webm > <file name>.webm
  ```

- **The data file's `session_audio` row** lists `audio_file` (the name for the joined recording),
  `audio_pieces` (how many pieces to expect), `mime_type` and `user_agent` (the browser).

### What each browser records

| Browser | Format | File type |
|---|---|---|
| Chrome | Opus, 48 kHz | `.webm` |
| Firefox | Opus, 48 kHz | `.ogg` |
| Safari | AAC, 44.1 kHz | `.m4a` |

All record mono at about 64 kbps (about 0.5 MB per minute).

Chrome's `.webm` files don't store their total length, so some players can't show it or skip
around. They still decode in full, and converting them (below) fixes it.

**Microphone processing:** browsers turn on echo cancellation, noise suppression and automatic
volume adjustment by default, and these studies use those defaults. That's good for transcription.
For a study measuring the voice itself (loudness, pitch, voice quality), turn them off in the
`getUserMedia` constraints: automatic volume adjustment changes loudness, and noise suppression can
clip quiet speech onsets.

### Trial timestamps

Each `recording` row in the data has these times, in **milliseconds from the start of the audio
file**:

| Field | When |
|---|---|
| `trial_start_ms` | the trial screen appears |
| `video_onset_ms` | the question video starts playing |
| `video_end_ms` | the question video ends |
| `done_button_shown_ms` | the Done Speaking button appears |
| `trial_end_ms` | the participant clicks Done Speaking |

`part`, `trial_in_part` and `video` say which trial it is. Timestamps are accurate to roughly tens
of milliseconds, which is fine for response latencies of half a second or more.

## 3. Transcription (Whisper) and response latency

**Converting:** Whisper works at 16 kHz mono internally, so convert each joined recording to a
16 kHz mono WAV. This works the same for `.webm`, `.ogg` and `.m4a`:

```
ffmpeg -i participant.webm -ar 16000 -ac 1 -c:a pcm_s16le participant.wav
```

**Rules that protect the timestamps:**

- **Don't change the start or the speed.** Trimming the beginning, removing silences or changing
  speed breaks the alignment with the trial timestamps. If you cut the audio into one clip per
  trial, write down where each clip started and add that back to Whisper's times.
- **Check the length after converting.** The WAV's duration should match the last trial's
  `trial_end_ms`, within about 0.05 s.

**Matching answers to trials:** put each transcribed word in the trial whose
`trial_start_ms`–`trial_end_ms` window contains it.

**Accurate word times come from the tool, not the conversion:**

- **Plain Whisper:** word times can be off by a few hundred ms. Fine for matching answers to
  trials, too coarse for latency.
- **WhisperX:** lines each word up with the audio, typically to within a few tens of ms.
- **For response latency:** use a speech-onset detector, such as **Silero VAD**, or WhisperX's
  first word start. Latency = speech onset − `video_end_ms`. Speech that starts before the video
  ends gives a negative latency.

**Avoiding hallucinations:** Whisper can invent text during long silences, often things like
"Thank you."

- Use its speech-detection (VAD) filter, `condition_on_previous_text=False`, `language="en"`, and
  the `large-v3` model.
- Transcribing one clip per trial window also reduces this.

## 4. Hosting, data and launch checklist

- **Hosting:** Cloudflare Pages (`voice-study.pages.dev`), which deploys automatically on every
  push to `main`.
- **reCAPTCHA:** verified by `recaptcha-worker.js`. That file is pasted into the Cloudflare Worker
  editor; pushing to GitHub doesn't update the worker. The secret lives in Cloudflare as
  `RECAPTCHA_SECRET`.
- **DataPipe:** each study has its own DataPipe experiment and saves to Google Drive. If you set a
  session limit, allow several files per participant (the data file plus the audio pieces).
- **Prolific:** limit the study to desktop/laptop. Consider asking participants to use headphones
  so the video's sound doesn't get into their recording.
- **Before every launch:**
  1. Run the study in Chrome, Firefox and Safari.
  2. Check that every video loads on the live site.
  3. Do one real run, and confirm the `.json` and all `_part` files arrive in Drive and the
     joined audio plays.
  4. Run a small pilot and check its data before opening the full sample.
