// src/components/MusicComponent.tsx
'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTheme } from '../hooks/ThemeContext'; // adjust path if needed

const MUSIC_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const CURRENT_TIME_KEY = 'music-current-time';
const PLAYING_KEY = 'music-playing';
const AUTO_RESUME_KEY = 'music-autoresume';

let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let audioToastLock = false;

function ensureAudioElemOnce(): HTMLAudioElement {
  if (audioEl) return audioEl;
  const a = document.createElement('audio');
  a.loop = true;
  a.preload = 'auto';
  a.style.display = 'none';
  try {
    a.crossOrigin = 'anonymous';
    a.dataset.cross = 'anonymous';
  } catch {}
  document.body.appendChild(a);
  a.src = MUSIC_URL;
  try { a.load(); } catch {}
  a.addEventListener('error', () => {
    //console.error('Audio element error', a.error, a.currentSrc, a.getAttribute('crossorigin'));
    const alreadyRetried = a.getAttribute('data-retried-nocors') === '1';
    const hadCross = a.getAttribute('crossorigin') !== null;
    if (!alreadyRetried && hadCross) {
      try { a.setAttribute('data-retried-nocors', '1'); a.removeAttribute('crossorigin'); } catch {}
      try { a.load(); } catch {}
    }
    if (!audioToastLock) {
      audioToastLock = true;
      //toast.error('Audio element error. Check console/network/CORS.');
    }
  });
  a.addEventListener('timeupdate', () => {
    try { sessionStorage.setItem(CURRENT_TIME_KEY, String(a.currentTime)); } catch {}
  });
  audioEl = a;
  return a;
}

async function createAudioContextIfNeededOnce(): Promise<AudioContext | null> {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  } catch (e) {
    audioCtx = null;
    gainNode = null;
  }
  return audioCtx;
}

async function connectMediaElementToCtxOnce(el: HTMLAudioElement, v = 0.5, muted = false) {
  try {
    await createAudioContextIfNeededOnce();
    if (!audioCtx) {
      el.volume = muted ? 0 : v;
      el.muted = muted;
      return;
    }
    if (mediaSource) {
      if (gainNode) gainNode.gain.value = muted ? 0 : v;
      el.volume = muted ? 0 : v;
      el.muted = muted;
      return;
    }
    try {
      const src = el.currentSrc || el.src;
      if (src) {
        const audioOrigin = new URL(src).origin;
        const pageOrigin = window.location.origin;
        if (audioOrigin !== pageOrigin) { el.volume = muted ? 0 : v; el.muted = muted; return; }
      }
    } catch {}
    try {
      mediaSource = audioCtx.createMediaElementSource(el);
      if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
      }
      mediaSource.connect(gainNode);
      if (gainNode) gainNode.gain.value = muted ? 0 : v;
      el.volume = muted ? 0 : v;
      el.muted = muted;
    } catch (err) {
      el.volume = muted ? 0 : v;
      el.muted = muted;
    }
  } catch {}
}

function setSessionPlaying(flag: boolean) {
  try { if (flag) sessionStorage.setItem(PLAYING_KEY, '1'); else sessionStorage.removeItem(PLAYING_KEY); } catch {}
}
function getSessionPlaying() { try { return sessionStorage.getItem(PLAYING_KEY) === '1'; } catch { return false; } }
function setAutoResume(flag: boolean) { try { if (flag) sessionStorage.setItem(AUTO_RESUME_KEY, '1'); else sessionStorage.removeItem(AUTO_RESUME_KEY); } catch {} }
function getSavedCurrentTime(): number | null {
  try {
    const v = sessionStorage.getItem(CURRENT_TIME_KEY);
    if (!v) return null;
    const n = parseFloat(v); return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export default function MusicComponent() {
  const { isDark } = useTheme(); // read theme directly from context
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const el = ensureAudioElemOnce();

    setIsPlaying(!el.paused && !el.ended);
    setIsMuted(el.muted || el.volume === 0);
    setVolume(el.volume ?? 0.5);

    (async () => {
      await createAudioContextIfNeededOnce();
      if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch {} }
      await connectMediaElementToCtxOnce(el, volume, isMuted);

      if (getSessionPlaying() && el.paused) {
        const saved = getSavedCurrentTime();
        if (saved !== null) {
          try {
            if (!isNaN(el.duration) && isFinite(el.duration)) {
              const within = Math.max(0, Math.min(saved, Math.max(0, el.duration - 0.1)));
              el.currentTime = within;
            } else {
              el.addEventListener('loadedmetadata', function onceMeta() {
                try {
                  const within = Math.max(0, Math.min(saved, Math.max(0, el.duration - 0.1)));
                  el.currentTime = within;
                } catch {}
                el.removeEventListener('loadedmetadata', onceMeta);
              });
            }
          } catch {}
        }
        try {
          const p = el.play();
          if (p && typeof (p as any).then === 'function') await p;
        } catch (err) {
          try {
            el.muted = true;
            await el.play();
            setTimeout(() => { try { el.muted = false; el.volume = isMuted ? 0 : volume; if (gainNode) gainNode.gain.value = isMuted ? 0 : volume; } catch {} }, 250);
          } catch {}
        }
      }
    })();

    const onPlay = () => { if (mountedRef.current) { setIsPlaying(true); setSessionPlaying(true); } };
    const onPause = () => { if (mountedRef.current) { setIsPlaying(false); setSessionPlaying(false); } };
    const onVolumeChange = () => { if (!mountedRef.current) return; setIsMuted(el.muted || el.volume === 0); setVolume(el.volume ?? 0); };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('volumechange', onVolumeChange);

    const handleVisibility = async () => {
      try {
        if (document.hidden) {
          if (!el.paused && !el.ended) { el.pause(); setAutoResume(true); }
        } else {
          const shouldAuto = sessionStorage.getItem(AUTO_RESUME_KEY) === '1';
          if (shouldAuto) {
            setAutoResume(false);
            try {
              const saved = getSavedCurrentTime();
              if (saved !== null && !isNaN(el.duration) && isFinite(el.duration)) {
                const within = Math.max(0, Math.min(saved, Math.max(0, el.duration - 0.1)));
                el.currentTime = within;
              }
              const p = el.play();
              if (p && typeof (p as any).then === 'function') await p;
            } catch {
              try { el.muted = true; await el.play(); setTimeout(() => { try { el.muted = false; } catch {} }, 250); } catch {}
            }
          }
        }
      } catch (err) { console.warn('visibility handler error', err); }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      try {
        el.removeEventListener('play', onPlay);
        el.removeEventListener('pause', onPause);
        el.removeEventListener('volumechange', onVolumeChange);
        document.removeEventListener('visibilitychange', handleVisibility);
      } catch {}
    };
  }, []); // run once

  const handlePlayToggle = async () => {
    try {
      const el = ensureAudioElemOnce();
      if (!el.paused && !el.ended) { el.pause(); setIsPlaying(false); setSessionPlaying(false); return; }

      const saved = getSavedCurrentTime();
      if (saved !== null) {
        try {
          if (!isNaN(el.duration) && isFinite(el.duration)) {
            const within = Math.max(0, Math.min(saved, Math.max(0, el.duration - 0.1)));
            el.currentTime = within;
          } else {
            el.addEventListener('loadedmetadata', function onceMeta() {
              try {
                const within = Math.max(0, Math.min(saved, Math.max(0, el.duration - 0.1)));
                el.currentTime = within;
              } catch {}
              el.removeEventListener('loadedmetadata', onceMeta);
            });
          }
        } catch {}
      }

      let played = false;
      try {
        const p = el.play();
        if (p && typeof (p as any).then === 'function') await p;
        played = !el.paused && !el.ended;
      } catch {}

      if (!played) {
        try {
          el.muted = true;
          await el.play();
          setTimeout(() => { try { el.muted = false; el.volume = isMuted ? 0 : volume; if (gainNode) gainNode.gain.value = isMuted ? 0 : volume; } catch {} }, 250);
        } catch {
          toast.error('Browser blocked playback. Press Play again.');
          return;
        }
      }

      try {
        await createAudioContextIfNeededOnce();
        if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch {} }
        await connectMediaElementToCtxOnce(el, volume, isMuted);
        if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
        el.volume = isMuted ? 0 : volume;
        el.muted = isMuted;
      } catch {}

      setIsPlaying(!el.paused && !el.ended);
      setSessionPlaying(true);
    } catch (e) { console.error('handlePlayToggle error:', e); toast.error("Audio couldn't start — check console."); }
  };

  const handleMuteToggle = async () => {
    try {
      const newMuted = !isMuted; setIsMuted(newMuted);
      const el = ensureAudioElemOnce();
      if (gainNode) gainNode.gain.value = newMuted ? 0 : volume;
      try {
        el.muted = newMuted; el.volume = newMuted ? 0 : volume;
        if (!newMuted && (el.paused || el.ended)) { await el.play(); setIsPlaying(true); setSessionPlaying(true); }
      } catch { toast('Audio unmuted — press play to start.', { duration: 3500 }); }
    } catch (err) { console.error('handleMuteToggle failed:', err); }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    try { if (gainNode) gainNode.gain.value = isMuted ? 0 : newVol; const el = audioEl; if (el) el.volume = newVol; if (newVol > 0 && isMuted) setIsMuted(false); } catch {}
  };

  // Use isDark from context to switch local UI classes
  return (
    <div className={`fixed bottom-6 left-6 z-40 glassmorphism rounded-2xl p-4 ${isDark ? 'bg-slate-800/20 border border-white/10' : 'bg-white/20 border border-gray-200/20'} shadow-2xl`}>
      <div className="flex items-center gap-3">
        <button onClick={handlePlayToggle} className={`p-3 rounded-xl transition-all duration-300 hover:scale-110 ${isPlaying ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : isDark ? 'bg-slate-700/50 text-slate-300' : 'bg-white/50 text-gray-700'}`} aria-label={isPlaying ? 'Pause music' : 'Play music'}>
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2">
          <button onClick={handleMuteToggle} className={`p-2 rounded-lg ${isDark ? 'text-slate-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`} aria-label="Toggle mute">
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => handleVolumeChange(parseFloat(e.target.value))} className="w-16 accent-purple-500" aria-label="Volume" />
        </div>

        <div className="text-xs">
          <div className={`${isDark ? 'text-white' : 'text-gray-800'} font-medium`}>Web3 Vibes</div>
          <div className="text-gray-400">Background Music</div>
        </div>
      </div>
    </div>
  );
}
