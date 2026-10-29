/* ------------------------------------------------------------------
 * adult self-description study: 1 warm-up trial + main parts (self-description + category fluency)
 * ------------------------------------------------------------------ */

// ====================================================================
// STUDY CONFIGURATION 
// ====================================================================

// ---- Warm-up -------------------------------------------------------
const WARMUP = {
  instructions: `
    <h2>Warm-up</h2>
    <p>Let's start with a practice recording so you can check your audio.</p>
    <p>Read the sentence in the following screen aloud. Once you are done, click <b>Continue</b>. You can listen to your recording and
       re-record as many times as you like until it sounds clear.</p>
       <p>The recording will start automatically, right after you click <b>Start warm-up</b>.</p>`,
  start_button: "Start warm-up",
  trial_prompt: "Read aloud:", // shown above the text on the warm-up trial ("" for none)
  text: "The trees are very tall and green.",
  recording_duration_ms: 10000,
};

// ---- Video stimuli -------------------------------------------------
// Folder (in the GitHub repo, next to index.html) that holds the stimulus videos.
// Each stimulus below names its own file inside this folder.
const VIDEO_FOLDER = "mp4/";

// ---- Intro videos --------------------------------------------------
// Each part can list intro videos (intro_videos below) that play in order before its trials.
// They are not trials and are not recorded: if the session recording is already running
// (e.g. before Part 2), it is paused during them and resumes when the part's trials start.
// The button stays disabled until each video has finished playing.
const INTRO_BUTTON = "Continue";

// ---- Main parts ----------------------------------------------------
// Each part has its own intro videos, per-trial prompt, stimuli and settings.
const PARTS = [
  {
    intro_videos: ["main_adults_0.mp4", "main_adults_00.mp4", "main_trial_000.mp4"], // filenames in VIDEO_FOLDER
    trial_prompt: " ", // text above every trial
    randomize_order: false, // keep order: first question first, final question last
    // Each stimulus: video = filename in VIDEO_FOLDER, text = shown under the video ("" for none)
    stimuli: [
      { video: "main_trial_1.mp4", text: " " },
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
    trial_prompt: "Please provide one answer at a time. Click <b>Done</b> to move on.", // text above every trial
    randomize_order: false,
    stimuli: [
      { video: "animal_trial_1.mp4", text: "What's the first animal that comes to mind?"},
      { video: "animal_trial_2.mp4", text: "What's another animal?" },
      { video: "animal_trial_3.mp4", text: "What's another animal?" },
      { video: "animal_trial_4.mp4", text: "What's another animal?" },
      { video: "animal_trial_5.mp4", text: "What's another animal?" },
      { video: "animal_trial_6.mp4", text: "What's another animal?" },
      { video: "animal_trial_7.mp4", text: "What's another animal?" },
      { video: "animal_trial_8.mp4", text: "What's another animal?" },
      { video: "animal_trial_9.mp4", text: "What's another animal?" },
      { video: "animal_trial_10.mp4", text: "What's another animal?" },
      { video: "animal_trial_11.mp4", text: "What's another animal?" },
      { video: "animal_trial_12.mp4", text: "What's the last animal?" },
    ],
  },
];

// ---- Main-part trials ----------------------------------------------
// One continuous recording covers all main-part trials; this button just moves to the next one.
const TRIAL_BUTTON = "Done";

// ====================================================================

// Blinking red dot shown while the microphone is recording
const REC_INDICATOR = `
  <div class="rec-indicator"><span class="rec-dot"></span>Recording in progress</div>`;

// ---- Session-level recording ---------------------------------------
// Starts when the first stimulus video starts playing and runs until the end of the study,
// paused only during intro videos.
let micStream = null;
const session = {
  recorder: null,
  chunks: [],
  startTime: null, // performance.now() when the recorder actually started
  pausedAt: null, // performance.now() when the current pause began
  pausedTotal: 0, // ms spent paused so far (not in the audio file)
};

function startSessionRecording() {
  if (session.recorder) return;
  session.recorder = new MediaRecorder(micStream);
  session.recorder.ondataavailable = (e) => {
    if (e.data.size > 0) session.chunks.push(e.data);
  };
  session.recorder.onstart = () => {
    session.startTime = performance.now();
  };
  session.recorder.start(1000); // collect in 1 s chunks so little is lost if something fails
}

function pauseSessionRecording() {
  if (session.recorder && session.recorder.state === "recording") {
    session.recorder.pause();
    session.pausedAt = performance.now();
  }
}

function resumeSessionRecording() {
  if (session.recorder && session.recorder.state === "paused") {
    session.recorder.resume();
    session.pausedTotal += performance.now() - session.pausedAt;
    session.pausedAt = null;
  }
}

// Stops the recorder and resolves with the whole session as a base64 string
function stopSessionRecording() {
  return new Promise((resolve) => {
    if (!session.recorder) return resolve(null);
    session.recorder.onstop = () => {
      const blob = new Blob(session.chunks, { type: session.recorder.mimeType });
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    };
    session.recorder.stop();
  });
}

// Position in the session audio file, in ms (null if recording hasn't started).
// Paused time is left out, so this matches the audio for times after the latest pause.
function sessionTime(t) {
  return session.startTime === null || t === null
    ? null
    : Math.round(t - session.startTime - session.pausedTotal);
}

// Recording screen: indicator, optional prompt line, optional video, then the stimulus text
function stimulusHtml(prompt, text, video) {
  const promptHtml = prompt ? `<p class="trial-prompt">${prompt}</p>` : "";
  const videoHtml = video
    ? `<video class="stim-video" src="${VIDEO_FOLDER}${video}" autoplay playsinline></video>`
    : "";
  const textHtml = text ? `<div class="stim-text">${text}</div>` : "";
  return `${REC_INDICATOR}${promptHtml}${videoHtml}${textHtml}`;
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
    // Keep the main-part trials and the session audio (warm-up and instruction screens are excluded)
    const data = jsPsych.data
      .get()
      .filterCustom((trial) => trial.task === "recording" || trial.task === "session_audio");
    const pid = jsPsych.data.getURLVariable("PROLIFIC_PID") || jsPsych.randomization.randomID(8);
    data.localSave("json", `voice_study_${pid}.json`);

    jsPsych.getDisplayElement().innerHTML =
      "<p>Thank you! The study is complete. Your data has been saved.</p>";
  },
});

const timeline = [];

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

// ---- Preload stimulus videos ---------------------------------------
timeline.push({
  type: jsPsychPreload,
  video: [
    ...PARTS.flatMap((part) => [
      ...(part.intro_videos || []).map((v) => VIDEO_FOLDER + v),
      ...part.stimuli.map((s) => VIDEO_FOLDER + s.video),
    ]),
  ],
  message: "<p>Loading videos, please wait...</p>",
  show_detailed_errors: true,
});

// ---- Warm-up (playback + re-record allowed, data NOT saved) ----------
timeline.push({
  type: jsPsychHtmlButtonResponse,
  stimulus: `<div class="instructions">${WARMUP.instructions}</div>`,
  choices: [WARMUP.start_button],
});

timeline.push({
  type: jsPsychHtmlAudioResponse,
  stimulus: stimulusHtml(WARMUP.trial_prompt, WARMUP.text),
  recording_duration: WARMUP.recording_duration_ms,
  show_done_button: true,
  allow_playback: true, // shows playback + "Record again" button
  record_again_button_label: "Record again",
  accept_button_label: "Sounds good, continue",
  data: { task: "warmup" },
  on_finish: function (data) {
    data.response = null; // discard warm-up audio
  },
});

// ---- Main parts ----------------------------------------------------
function buildPart(part, partNumber) {
  // Intro videos (not trials, not recorded): pause the session recording while they play
  const intro = (part.intro_videos || []).map((video) => ({
    type: jsPsychHtmlButtonResponse,
    stimulus: `<video class="stim-video" src="${VIDEO_FOLDER}${video}" autoplay playsinline></video>`,
    choices: [INTRO_BUTTON],
    on_load: () => {
      pauseSessionRecording();
      playVideoWithLockedButtons();
    },
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
      resumeSessionRecording(); // no-op unless an intro video paused it
      trialStart = performance.now();
      videoOnset = null;
      videoEnd = null;
      // "Done" stays disabled until the video has finished; a blocked autoplay
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

  return [...intro, trials];
}

PARTS.forEach((part, i) => timeline.push(...buildPart(part, i + 1)));

// ---- Stop and save the session recording ---------------------------
let sessionAudio = null;
timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: async function (done) {
    jsPsych.getDisplayElement().innerHTML = "<p>Saving your recording, please wait...</p>";
    sessionAudio = await stopSessionRecording();
    micStream?.getTracks().forEach((t) => t.stop()); // release the microphone
    done();
  },
  data: { task: "session_audio" },
  on_finish: (data) => {
    data.response = sessionAudio; // base64-encoded audio of the whole session
    data.mime_type = session.recorder ? session.recorder.mimeType : null;
  },
});

jsPsych.run(timeline);
