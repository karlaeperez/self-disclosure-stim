/* ------------------------------------------------------------------
 * adult self-description study: 1 warm-up trial + main parts (self-description + category fluency)
 * ------------------------------------------------------------------ */

// ====================================================================
// STUDY CONFIGURATION 
// ====================================================================

// ---- Data saving (DataPipe -> GDrive) ---------------------------------
// Experiment ID from pipe.jspsych.org
const DATAPIPE_EXPERIMENT_ID = "r6xeXGMfXPhn";
// Shown only if an upload fails after retrying; the participant can then download their files
const UPLOAD_FAILED_MESSAGE = `
  <p>Sorry, we couldn't save your data to our server.</p>
  <p>Please click <b>Download my data</b> and send the downloaded files to us through a Prolific message.
     You will still be credited for completing the study.</p>`;

// ---- Prolific ------------------------------------------------------
// Participants are sent here at the end of the study
const PROLIFIC_COMPLETION_URL = "https://app.prolific.com/submissions/complete?cc=CJG2TUCF";

// ---- reCAPTCHA (bot check, first screen of the study) --------------
const RECAPTCHA = {
  site_key: "6LcbqQ4uAAAAAPxvFgouL1OUQKPUN0G7flu2jHq3", // public key from Google Cloud
  verify_url: "https://recaptcha-verify.perezke.workers.dev", // Cloudflare Worker (recaptcha-worker.js)
  // false = participants who fail verification continue and are flagged (recaptcha_passed in the data)
  // true = they are stopped on the reCAPTCHA screen with fail_message
  block_on_fail: false,
  fail_message: "<p>Sorry, we couldn't verify your browser. Please contact the researcher.</p>",
};

// ---- Warm-up -------------------------------------------------------
const WARMUP = {
  instructions: `
    <h2>Warm-up</h2>
    <p>Let's start with a practice voice recording so you can check your audio.</p>
    <p>Read the sentence in the following screen aloud. Once you are done, click <b>Continue</b>. Please listen to your recording and
       re-record until it sounds clear.</p>
       <p>The recording will start automatically, right after you click <b>Continue</b> down below.</p>`,
  start_button: `Continue (Start Recording<span class="btn-rec-dot"></span>)`,
  trial_prompt: "Read aloud:", // shown above the text on the warm-up trial ("" for none)
  text: "The trees are very tall and green.",
  recording_duration_ms: 10000,
  // Transition screen shown after the warm-up, before the first intro video
  end_message: "<p>Thank you for checking your microphone! You are ready to begin the study.</p>",
  end_button: "Continue",
};

// ---- Video stimuli -------------------------------------------------
// Folder in the GitHub repo where the mp4 files are stored (relative to the HTML file)
const VIDEO_FOLDER = "mp4/";

// ---- Intro videos --------------------------------------------------
// Each part can list intro videos (intro_videos below) that play in order before its trials.
// They are not trials. Part 1's intro plays before the session recording starts; later parts'
// intros are recorded, since the session recording runs without pauses from Part 1's first trial on.
// The button stays disabled until each video has finished playing.
const INTRO_BUTTON = "Continue";
// On the last intro video, right before the part's first trial, if the recording hasn't started yet
const INTRO_LAST_BUTTON = `Continue (Start Recording<span class="btn-rec-dot"></span>)`;

// ---- End videos ----------------------------------------------------
// Each part can also list end videos (end_videos below) that play in order after its last trial.
// They are recorded, except for the last part's: the session recording stops when they start.
const END_BUTTON = "Continue";

// ---- Main parts ----------------------------------------------------
// Each part has its own intro videos, per-trial prompt, stimuli and settings.
const PARTS = [
  {
    intro_videos: ["main_adults_0.mp4", "main_adults_00.mp4", "main_adults_000.mp4"], // filenames in VIDEO_FOLDER
    end_videos: ["main_trial_END.mp4"], // played after the last trial
    trial_prompt: " ", // text above every trial
    randomize_order: false, 
    // Each stimulus: video = filename in VIDEO_FOLDER, text = shown under the video ("" for none)
    stimuli: [
      { video: "main_adults_1.mp4", text: " " },
      { video: "main_trial_2.mp4", text: " " },
      { video: "main_trial_3.mp4", text: " " },
      { video: "main_trial_4.mp4", text: " " },
      { video: "main_trial_5.mp4", text: " " },
      { video: "main_trial_6.mp4", text: " " },
      { video: "main_trial_7.mp4", text: " " },
      { video: "main_trial_8.mp4", text: " " },
      { video: "main_trial_9.mp4", text: " " },
      { video: "main_trial_10.mp4", text: " " },
      { video: "main_trial_11.mp4", text: " " },
      { video: "main_trial_12.mp4", text: " " },
    ],
  },
  {
    intro_videos: ["animal_trial_0.mp4"],
    end_videos: ["animal_trial_END.mp4"],
    trial_prompt: "Please provide one answer at a time. Click <b>Next</b> to move on.", // text above every trial
    randomize_order: false,
    stimuli: [
      { video: "animal_trial_1.mp4", text: " "},
      { video: "animal_trial_2.mp4", text: " " },
      { video: "animal_trial_3.mp4", text: " " },
      { video: "animal_trial_4.mp4", text: " " },
      { video: "animal_trial_5.mp4", text: " " },
      { video: "animal_trial_6.mp4", text: " " },
      { video: "animal_trial_7.mp4", text: " " },
      { video: "animal_trial_8.mp4", text: " " },
      { video: "animal_trial_9.mp4", text: " " },
      { video: "animal_trial_10.mp4", text: " " },
      { video: "animal_trial_11.mp4", text: " " },
      { video: "animal_trial_12.mp4", text: " " },
    ],
  },
];

// ---- Main-part trials ----------------------------------------------
// One continuous recording covers all main-part trials; this button just moves to the next one.
const TRIAL_BUTTON = "Next";

// ====================================================================

// Blinking red dot shown while the microphone is recording
const REC_INDICATOR = `
  <div class="rec-indicator"><span class="rec-dot"></span>Recording in progress</div>`;

// ---- Session-level recording ---------------------------------------
// One continuous recording, never paused: it starts when the first stimulus video starts playing
// and stops right after the last trial of the last part.
let micStream = null;
const session = {
  recorder: null,
  chunks: [],
  startTime: null, // performance.now() when the recorder actually started
  stopped: null, // Promise from stopSessionRecording(), so it only stops once
};

function isSessionRecording() {
  return session.recorder !== null && session.recorder.state === "recording";
}

function startSessionRecording() {
  if (session.recorder) return;
  // 64 kbps is plenty for speech and keeps long sessions under DataPipe's 32 MB upload limit
  session.recorder = new MediaRecorder(micStream, { audioBitsPerSecond: 64000 });
  session.recorder.ondataavailable = (e) => {
    if (e.data.size > 0) session.chunks.push(e.data);
  };
  session.recorder.onstart = () => {
    session.startTime = performance.now();
  };
  session.recorder.start(1000); // collect in 1 s chunks so little is lost if something fails
}

// Stops the recorder and resolves with the whole session as a base64 string.
// Safe to call more than once: later calls return the same Promise.
function stopSessionRecording() {
  if (session.stopped) return session.stopped;
  session.stopped = new Promise((resolve) => {
    if (!session.recorder) return resolve(null);
    session.recorder.onstop = () => {
      const blob = new Blob(session.chunks, { type: session.recorder.mimeType });
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    };
    session.recorder.stop();
  });
  return session.stopped;
}

// Position in the session audio file, in ms (null if recording hasn't started)
function sessionTime(t) {
  return session.startTime === null || t === null ? null : Math.round(t - session.startTime);
}

// ---- Background video loading --------------------------------------
// All videos start downloading as soon as the page opens, so they load while participants go
// through consent, the microphone check and the warm-up. A failed download (e.g. a temporary
// GitHub Pages 503) is retried. Right before Part 1, a loading screen is shown only if videos
// are still downloading.
const VIDEO_LOAD_ATTEMPTS = 4; // tries per video
const VIDEO_LOAD_PARALLEL = 3; // videos downloading at once (in timeline order, so Part 1 comes first)
const VIDEO_WAIT_MAX_MS = 180000; // longest the pre-Part 1 loading screen waits before moving on

const videoFiles = [
  ...new Set(
    PARTS.flatMap((part) => [...(part.intro_videos || []), ...part.stimuli.map((s) => s.video), ...(part.end_videos || [])])
  ),
];
const videoLoad = {
  blobUrls: {}, // filename -> in-memory copy
  failed: [], // filenames that failed every attempt
  finished: 0, // loaded + failed
  onProgress: null, // set by the loading screen
};

async function downloadVideo(video) {
  for (let attempt = 1; attempt <= VIDEO_LOAD_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(VIDEO_FOLDER + video);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      videoLoad.blobUrls[video] = URL.createObjectURL(await response.blob());
      return;
    } catch (err) {
      console.warn(`Video download failed (attempt ${attempt}/${VIDEO_LOAD_ATTEMPTS}): ${video}`, err);
      if (attempt < VIDEO_LOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  videoLoad.failed.push(video);
}

const videosReady = (async () => {
  const queue = [...videoFiles];
  const worker = async () => {
    while (queue.length) {
      await downloadVideo(queue.shift());
      videoLoad.finished += 1;
      if (videoLoad.onProgress) videoLoad.onProgress();
    }
  };
  await Promise.all(Array.from({ length: VIDEO_LOAD_PARALLEL }, worker));
})();

// In-memory copy of a video if it has downloaded, otherwise its normal path (streams instead)
function videoSrc(video) {
  return videoLoad.blobUrls[video] || VIDEO_FOLDER + video;
}

// Video screen between trials (intro/end videos), with the recording indicator under the video while recording
function transitionVideoHtml(video) {
  const indicator = isSessionRecording() ? REC_INDICATOR : "";
  return `<video class="stim-video" src="${videoSrc(video)}" autoplay playsinline></video>${indicator}`;
}

// Recording screen: optional prompt line, optional video, recording indicator, then the stimulus text
function stimulusHtml(prompt, text, video) {
  const promptHtml = prompt ? `<p class="trial-prompt">${prompt}</p>` : "";
  const videoHtml = video
    ? `<video class="stim-video" src="${videoSrc(video)}" autoplay playsinline></video>`
    : "";
  const textHtml = text ? `<div class="stim-text">${text}</div>` : "";
  return `${promptHtml}${videoHtml}${REC_INDICATOR}${textHtml}`;
}

// Plays the screen's video and keeps its buttons disabled until the video has finished.
// If autoplay is blocked, shows the video controls so the participant can press play.
// Returns the video element (null if the screen has none).
function playVideoWithLockedButtons(onAutoplayBlocked) {
  const display = jsPsych.getDisplayElement();
  const video = display.querySelector(".stim-video");
  if (!video) return null;
  const buttons = display.querySelectorAll("#jspsych-html-button-response-btngroup button");
  const enableButtons = () => buttons.forEach((b) => (b.disabled = false));
  buttons.forEach((b) => (b.disabled = true));
  video.addEventListener("ended", enableButtons, { once: true });
  // If the video can't be played at all, don't leave the participant stuck
  video.addEventListener("error", enableButtons, { once: true });
  video.play().catch(() => {
    video.controls = true;
    if (onAutoplayBlocked) onAutoplayBlocked();
  });
  return video;
}

// ---- Setup ---------------------------------------------------------
const jsPsych = initJsPsych({
  on_finish: function () {
    jsPsych.getDisplayElement().innerHTML =
      "<p>Thank you! The study is complete. Redirecting you to Prolific...</p>";
    window.location.href = PROLIFIC_COMPLETION_URL;
  },
});

const pid = jsPsych.data.getURLVariable("PROLIFIC_PID") || jsPsych.randomization.randomID(8);

const timeline = [];

// ---- reCAPTCHA -----------------------------------------------------
// Checkbox must be ticked before Continue is enabled; the token is then checked
// by the Cloudflare Worker (it expires after 2 minutes, so it must be checked live).
let recaptchaResult = { passed: null, error: null };
timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: function (done) {
    const display = jsPsych.getDisplayElement();
    const fail = (error) => {
      recaptchaResult = { passed: false, error };
      if (RECAPTCHA.block_on_fail) display.innerHTML = RECAPTCHA.fail_message;
      else done();
    };

    // Script blocked (e.g. by a browser extension)
    if (typeof grecaptcha === "undefined") {
      recaptchaResult = { passed: null, error: "script-not-loaded" };
      if (RECAPTCHA.block_on_fail) display.innerHTML = RECAPTCHA.fail_message;
      else done();
      return;
    }

    display.innerHTML = `
      <p>Before we begin, please confirm that you are not a robot.</p>
      <div id="recaptcha-box" style="display:inline-block; margin:10px 0;"></div>
      <p id="recaptcha-status" role="status"></p>
      <p><button class="jspsych-btn" id="recaptcha-continue" disabled>Continue</button></p>`;
    const status = display.querySelector("#recaptcha-status");
    const button = display.querySelector("#recaptcha-continue");
    let token = null;

    grecaptcha.ready(() =>
      grecaptcha.render("recaptcha-box", {
        sitekey: RECAPTCHA.site_key,
        callback: (t) => {
          token = t;
          button.disabled = false;
        },
        "expired-callback": () => {
          token = null;
          button.disabled = true;
        },
      })
    );

    button.addEventListener("click", async () => {
      button.disabled = true;
      status.textContent = "Checking...";
      try {
        const res = await fetch(RECAPTCHA.verify_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await res.json();
        if (result.success === true) {
          recaptchaResult = { passed: true, error: null };
          done();
        } else {
          fail((result.error_codes || []).join(",") || "failed");
        }
      } catch (err) {
        fail("verifier-unreachable");
      }
    });
  },
  data: { task: "recaptcha" },
  on_finish: (data) => {
    data.recaptcha_passed = recaptchaResult.passed;
    data.recaptcha_error = recaptchaResult.error;
  },
});

// ---- Welcome & microphone ------------------------------------------
timeline.push({
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <div class="instructions">
      <h2>Welcome</h2>
      <p>In this study you will answer a few questions aloud. Your voice will be recorded.</p>
      <p>Please sit in a quiet room. On the next screen, your browser will ask for permission to use your microphone.</p>
    </div>`,
  choices: ["Continue"],
});

// Custom microphone setup 
timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: async function (done) {
    const display = jsPsych.getDisplayElement();
    display.innerHTML = "<p>Requesting microphone access...</p>";

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      display.innerHTML = `
        <p>We couldn't access your microphone.</p>
        <p>Please allow microphone access in your browser settings and reload this page.</p>`;
      return; // study cannot continue without a microphone
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    let mics = devices.filter((d) => d.kind === "audioinput" && d.deviceId);
    // Drop "default"/"communications" aliases when real devices are listed
    const realMics = mics.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
    if (realMics.length > 0) mics = realMics;
    // Remove duplicates (same physical device listed more than once)
    mics = mics.filter((m, i, arr) => !m.groupId || arr.findIndex((v) => v.groupId === m.groupId) === i);

    const finish = (activeStream) => {
      micStream = activeStream;
      jsPsych.pluginAPI.initializeMicrophoneRecorder(activeStream);
      const track = activeStream.getAudioTracks()[0];
      done({ mic_label: track ? track.label : "" });
    };

    if (mics.length <= 1) {
      finish(stream);
      return;
    }

    const currentId = stream.getAudioTracks()[0]?.getSettings().deviceId;
    const options = mics
      .map((m, i) => {
        const label = m.label || `Microphone ${i + 1}`;
        const selected = m.deviceId === currentId ? "selected" : "";
        return `<option value="${m.deviceId}" ${selected}>${label}</option>`;
      })
      .join("");

    display.innerHTML = `
      <p>Please select the microphone you would like to use.</p>
      <select id="mic-select" style="font-size:16px; padding:6px; min-width:260px;">${options}</select>
      <p><button class="jspsych-btn" id="mic-confirm">Use this microphone</button></p>`;

    display.querySelector("#mic-confirm").addEventListener("click", async () => {
      const chosenId = display.querySelector("#mic-select").value;
      if (chosenId === currentId) {
        finish(stream);
        return;
      }
      stream.getTracks().forEach((t) => t.stop());
      const chosenStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: chosenId } },
      });
      finish(chosenStream);
    });
  },
});

// ---- Warm-up (playback + re-record allowed, data NOT saved) ----------
timeline.push({
  type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="instructions">${WARMUP.instructions}</div>`,
  choices: [WARMUP.start_button],
});

// Recording and playback are on separate screens; "Record again" loops back to the recording screen
let warmupRecorder = null;
let warmupRecordingTimer = null;
let warmupAudio = null; // Promise resolving to the recorded Blob (null if recording failed)

const warmupRecord = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `${stimulusHtml(WARMUP.trial_prompt, WARMUP.text)}
    <p id="warmup-status" role="status">Recording your practice audio...</p>`,
  choices: ["Continue"],
  on_load: function () {
    const mimeTypes = [
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/webm;codecs=opus",
      "audio/webm",
    ];
    const mimeType =
      typeof MediaRecorder.isTypeSupported === "function"
        ? mimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
        : null;
    const options = mimeType ? { mimeType } : undefined;
    const chunks = [];

    warmupRecorder = null;
    warmupAudio = new Promise((resolve) => {
      try {
        const recorder = new MediaRecorder(micStream, options);
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          const type = recorder.mimeType || chunks[0]?.type;
          resolve(new Blob(chunks, type ? { type } : undefined));
        }, { once: true });
        recorder.addEventListener("error", () => resolve(null), { once: true });
        recorder.start();
        warmupRecorder = recorder;
      } catch (error) {
        console.error("Warm-up audio recording failed:", error);
        resolve(null);
      }
    });

    // Move on to playback automatically when the maximum duration is reached
    warmupRecordingTimer = setTimeout(() => {
      warmupRecordingTimer = null;
      jsPsych.finishTrial();
    }, WARMUP.recording_duration_ms);
  },
  on_finish: function (data) {
    if (warmupRecordingTimer !== null) {
      clearTimeout(warmupRecordingTimer);
      warmupRecordingTimer = null;
    }
    if (warmupRecorder && warmupRecorder.state === "recording") warmupRecorder.stop();
    data.task = "warmup";
  },
};

const warmupPlayback = {
  type: jsPsychHtmlButtonResponse,
  stimulus: `
    <p class="trial-prompt">Recording complete. Listen to it to check that it is clear.</p>
    <p id="warmup-status" role="status">Preparing your recording...</p>
    <audio id="warmup-playback" controls hidden></audio>`,
  choices: ["Record again", "Sounds good, continue"],
  on_load: async function () {
    const display = jsPsych.getDisplayElement();
    const status = display.querySelector("#warmup-status");
    const playback = display.querySelector("#warmup-playback");
    const [recordAgainButton, acceptButton] = display.querySelectorAll(
      "#jspsych-html-button-response-btngroup button"
    );
    // Both buttons stay disabled until the participant starts playing the recording
    recordAgainButton.disabled = true;
    acceptButton.disabled = true;

    const blob = await warmupAudio;
    if (!blob || blob.size === 0) {
      status.textContent = "Recording failed. Please record again.";
      recordAgainButton.disabled = false;
      return;
    }
    playback.addEventListener("play", () => {
      recordAgainButton.disabled = false;
      acceptButton.disabled = false;
    }, { once: true });
    // If the recording can't be played, don't leave the participant stuck
    playback.addEventListener("error", () => {
      status.textContent = "Your recording could not be played. Please record again.";
      recordAgainButton.disabled = false;
    }, { once: true });
    playback.src = URL.createObjectURL(blob);
    playback.hidden = false;
    status.textContent = "If your audio is unclear, please adjust your setup and record again until it is clear.";
  },
  data: { task: "warmup" },
  on_finish: function (data) {
    const playback = jsPsych.getDisplayElement().querySelector("#warmup-playback");
    if (playback) {
      playback.pause();
      if (playback.src) URL.revokeObjectURL(playback.src);
    }
  },
};

timeline.push({
  timeline: [warmupRecord, warmupPlayback],
  loop_function: (data) => data.last(1).values()[0].response === 0, // "Record again"
});

timeline.push({
  type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="instructions">${WARMUP.end_message}</div>`,
  choices: [WARMUP.end_button],
});

// ---- Wait for videos (skipped instantly if they finished during the warm-up) ----
let videoWaitResult = {};
timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: function (done) {
    const waitStart = performance.now();
    let finished = false;
    const finish = (timedOut) => {
      if (finished) return;
      finished = true;
      videoLoad.onProgress = null;
      videoWaitResult = {
        video_wait_ms: Math.round(performance.now() - waitStart),
        video_wait_timed_out: timedOut,
        videos_loaded: Object.keys(videoLoad.blobUrls).length,
        videos_total: videoFiles.length,
        videos_failed: videoLoad.failed.join(";"),
      };
      done();
    };
    if (videoLoad.finished === videoFiles.length) return finish(false);

    const display = jsPsych.getDisplayElement();
    display.innerHTML = `
      <p>Loading videos, please wait...</p>
      <div class="load-bar"><div class="load-bar-fill" id="load-bar-fill"></div></div>`;
    const update = () => {
      const fill = document.getElementById("load-bar-fill");
      if (fill) fill.style.width = `${(100 * videoLoad.finished) / videoFiles.length}%`;
    };
    update();
    videoLoad.onProgress = update;
    videosReady.then(() => finish(false));
    // Don't hold anyone here forever; videos that haven't loaded will stream instead
    setTimeout(() => finish(true), VIDEO_WAIT_MAX_MS);
  },
  data: { task: "video_wait" },
  on_finish: (data) => Object.assign(data, videoWaitResult),
});

// ---- Main parts ----------------------------------------------------
function buildPart(part, partNumber) {
  // Intro videos (not trials): recorded only if the session recording is already running (Part 2+)
  const introVideos = part.intro_videos || [];
  const intro = introVideos.map((video, i) => ({
    type: jsPsychHtmlButtonResponse,
    stimulus: () => transitionVideoHtml(video),
    choices: () => [i === introVideos.length - 1 && !isSessionRecording() ? INTRO_LAST_BUTTON : INTRO_BUTTON],
    on_load: () => playVideoWithLockedButtons(),
    data: { task: "intro_video", part: partNumber, video },
  }));

  // Absolute times (performance.now()) for the current trial; converted to session time on finish
  let trialStart = null;
  let videoOnset = null;
  let videoEnd = null;

  const recording = {
    type: jsPsychHtmlButtonResponse,
    stimulus: () =>
      stimulusHtml(part.trial_prompt, jsPsych.timelineVariable("text"), jsPsych.timelineVariable("video")),
    choices: [TRIAL_BUTTON],
    on_load: () => {
      trialStart = performance.now();
      videoOnset = null;
      videoEnd = null;
      // "Next" stays disabled until the video has finished; a blocked autoplay
      // must not stop the session recording from starting
      const video = playVideoWithLockedButtons(startSessionRecording);
      if (!video) {
        startSessionRecording();
        return;
      }
      video.addEventListener(
        "playing",
        () => {
          videoOnset = performance.now();
          startSessionRecording(); // no-op after the first video
        },
        { once: true }
      );
      video.addEventListener("ended", () => (videoEnd = performance.now()), { once: true });
    },
    data: {
      task: "recording",
      part: partNumber,
      text: jsPsych.timelineVariable("text"),
      video: jsPsych.timelineVariable("video"),
      stimulus_index: jsPsych.timelineVariable("index"),
    },
  };

  let trialCounter = 0;
  recording.on_finish = (data) => {
    startSessionRecording(); // safety net in case the video never played
    trialCounter += 1;
    data.trial_in_part = trialCounter;
    // Times in ms from the start of the session audio file (first trial's start can be slightly negative)
    data.trial_start_ms = sessionTime(trialStart);
    data.video_onset_ms = sessionTime(videoOnset);
    data.video_end_ms = sessionTime(videoEnd); // null only if the video failed to play
    data.trial_end_ms = sessionTime(performance.now());
  };

  const trials = {
    timeline: [recording],
    timeline_variables: part.stimuli.map((stim, index) => ({ text: stim.text, video: stim.video, index })),
    randomize_order: part.randomize_order,
  };

  // End videos (not trials): recorded, except the last part's, where the session recording stops.
  // Stopping in on_start (before the screen is drawn) keeps the indicator off that screen.
  const isLastPart = partNumber === PARTS.length;
  const end = (part.end_videos || []).map((video) => ({
    type: jsPsychHtmlButtonResponse,
    on_start: () => {
      if (isLastPart) stopSessionRecording();
    },
    stimulus: () => transitionVideoHtml(video),
    choices: [END_BUTTON],
    on_load: () => playVideoWithLockedButtons(),
    data: { task: "end_video", part: partNumber, video },
  }));

  return [...intro, trials, ...end];
}

PARTS.forEach((part, i) => timeline.push(...buildPart(part, i + 1)));

// ---- Stop and save the session recording ---------------------------
let sessionAudio = null;
timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: async function (done) {
    jsPsych.getDisplayElement().innerHTML = "<p>Saving your recording, please wait...</p>";
    sessionAudio = await stopSessionRecording(); // already stopped if the last part has end videos
    micStream?.getTracks().forEach((t) => t.stop()); // release the microphone
    done();
  },
  data: { task: "session_audio" },
  on_finish: (data) => {
    data.response = sessionAudio; // base64-encoded audio of the whole session
    data.mime_type = session.recorder ? session.recorder.mimeType : null;
  },
});

// ---- Upload to DataPipe --------------------------------------------
// Uploads call DataPipe's API directly (instead of plugin-pipe) so failures can be detected
// and retried: plugin-pipe reports network errors as successes and can hang on a server error.
const DATAPIPE_URL = "https://pipe.jspsych.org/api";
const UPLOAD_ATTEMPTS = 3;

// Random suffix so a participant who restarts doesn't hit DataPipe's duplicate-filename rejection
const fileBase = `voice_study_${pid}_${jsPsych.randomization.randomID(6)}`;

function audioExtension(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

// Resolves true once DataPipe accepts the file; retries network and server errors
async function uploadToDataPipe(endpoint, filename, dataString) {
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${DATAPIPE_URL}/${endpoint}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify({ experimentID: DATAPIPE_EXPERIMENT_ID, filename, data: dataString }),
      });
      if (res.ok) return true;
      const body = await res.text();
      console.error(`DataPipe rejected ${filename} (${res.status}):`, body);
      if (res.status < 500) return false; // e.g. FILE_EXISTS or SESSION_LIMIT_REACHED: retrying won't help
    } catch (error) {
      console.error(`Uploading ${filename} failed:`, error);
    }
    if (attempt < UPLOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return false;
}

// Files that could not be uploaded; offered as downloads on the fallback screen
const failedUploads = [];

timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: async function (done) {
    jsPsych.getDisplayElement().innerHTML =
      "<p>Saving your data. Please do not close this page.</p>";

    // reCAPTCHA result, video loading info, main-part trials and session info (warm-up and instruction screens are excluded).
    // The audio itself is left out since it is uploaded as its own file.
    const dataString = JSON.stringify(
      jsPsych.data
        .get()
        .filterCustom((trial) => ["recaptcha", "video_wait", "recording", "session_audio"].includes(trial.task))
        .values()
        .map((trial) => (trial.task === "session_audio" ? { ...trial, response: null } : trial))
    );
    const dataFile = `${fileBase}.json`;
    if (!(await uploadToDataPipe("data", dataFile, dataString))) {
      failedUploads.push({ filename: dataFile, blob: new Blob([dataString], { type: "application/json" }) });
    }

    // Skipped if nothing was recorded
    if (sessionAudio) {
      const mimeType = session.recorder?.mimeType || "audio/webm";
      const audioFile = `${fileBase}.${audioExtension(mimeType)}`;
      if (!(await uploadToDataPipe("base64", audioFile, sessionAudio))) {
        const blob = await (await fetch(`data:${mimeType};base64,${sessionAudio}`)).blob();
        failedUploads.push({ filename: audioFile, blob });
      }
    }
    done({ upload_failed: failedUploads.map((f) => f.filename) });
  },
  data: { task: "upload" },
});

// Only shown if an upload failed: let the participant download the files and send them to us
timeline.push({
  timeline: [
    {
      type: jsPsychHtmlButtonResponse,
      stimulus: `<div class="instructions">${UPLOAD_FAILED_MESSAGE}</div>
        <p><button class="jspsych-btn" id="download-data" type="button">Download my data</button></p>`,
      choices: ["Continue to Prolific"],
      on_load: function () {
        const display = jsPsych.getDisplayElement();
        const continueButton = display.querySelector("#jspsych-html-button-response-btngroup button");
        continueButton.disabled = true;
        display.querySelector("#download-data").addEventListener("click", () => {
          failedUploads.forEach(({ filename, blob }) => {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
          });
          continueButton.disabled = false;
        });
      },
    },
  ],
  conditional_function: () => failedUploads.length > 0,
});

jsPsych.run(timeline);
