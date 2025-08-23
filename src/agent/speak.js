import { exec, spawn } from 'child_process';
import { TTSConfig as pollinationsTTSConfig } from '../models/pollinations.js';
import { TTSConfig as gptTTSConfig } from '../models/gpt.js';
import { TTSConfig as geminiTTSConfig } from '../models/gemini.js';

let speakingQueue = [];
let isSpeaking = false;

export function say(text, speak_model) {
  speakingQueue.push([text, speak_model]);
  if (!isSpeaking) processQueue();
}

async function processQueue() {
  if (speakingQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  isSpeaking = true;
  const [txt, speak_model] = speakingQueue.shift();

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const model = speak_model || 'openai/tts-1/echo';

  if (model === 'system') {
    // system TTS
    const cmd = isWin
      ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; \
$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=2; \
$s.Speak('${txt.replace(/'/g,"''")}'); $s.Dispose()"`
      : isMac
      ? `say "${txt.replace(/"/g,'\\"')}"`
      : `espeak "${txt.replace(/"/g,'\\"')}"`;

    exec(cmd, err => {
      if (err) console.error('TTS error', err);
      processQueue();
    });

  } else {

    function getModelUrl(prov) {
      if (prov === 'pollinations') {
        return pollinationsTTSConfig.baseUrl;
      } else if (prov === 'openai') {
        return gptTTSConfig.baseUrl;
      } else if (prov === 'google') {
        return geminiTTSConfig.baseUrl;
      } else {
        // fallback
        return 'https://api.openai.com/v1'
      }
    }

    // remote audio provider
    let prov, mdl, voice, url;
    if (typeof model === "string") {
      [prov, mdl, voice] = model.split('/');
      url = getModelUrl(prov);
    } else {
      prov = model.api;
      mdl = model.model;
      voice = model.voice;
      url = model.url || getModelUrl(prov);
    }

    try {
      let audioData;
      if (prov === "pollinations") {
        audioData = await pollinationsTTSConfig.sendAudioRequest(txt, mdl, voice, url);
      } else if (prov === "openai") {
        audioData = await gptTTSConfig.sendAudioRequest(txt, mdl, voice, url);
      } else if (prov === "google") {
        audioData = await geminiTTSConfig.sendAudioRequest(txt, mdl, voice, url);
      } else {
        throw new Error(`TTS Provider ${prov} is not supported.`);
      }
      
      if (!audioData) {
        throw new Error("TTS model did not return audio data");
        // will be handled below
      }

      if (isWin) {
        const ps = `
          Add-Type -AssemblyName presentationCore;
          $p=New-Object System.Windows.Media.MediaPlayer;
          $p.Open([Uri]::new("data:audio/mp3;base64,${audioData}"));
          $p.Play();
          Start-Sleep -Seconds [math]::Ceiling($p.NaturalDuration.TimeSpan.TotalSeconds);
        `;
        spawn('powershell', ['-NoProfile','-Command', ps], {
          stdio: 'ignore', detached: true
        }).unref();
        processQueue();

      } else {
        const player = spawn('ffplay', ['-nodisp','-autoexit','pipe:0'], {
          stdio: ['pipe','ignore','ignore']
        });
        player.stdin.write(Buffer.from(audioData, 'base64'));
        player.stdin.end();
        player.on('exit', processQueue);
      }

    } catch (e) {
      console.error('[TTS] Audio error', e);
      processQueue();
    }
  }
}
