import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast';

function MusicComponent({
  isDark,
}: {
  isDark: boolean;
}) {
      // Web3 background music (robust approach: HTMLAudio first, then WebAudio connect)
      const MUSIC_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
      const audioElemRef = useRef<HTMLAudioElement | null>(null);
      const audioCtxRef = useRef<AudioContext | null>(null);
      const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
      const gainRef = useRef<GainNode | null>(null);
    
      const [isPlaying, setIsPlaying] = useState(false);
      const [isMuted, setIsMuted] = useState(false);
      const [volume, setVolume] = useState(0.5);
      const audioToastLockRef = useRef(false);

    const ensureAudioElem = (): HTMLAudioElement => {
  if (audioElemRef.current) return audioElemRef.current;

  const a = document.createElement("audio");
  a.loop = true;
  a.preload = "auto";
  a.style.display = "none";

  // Try to set crossorigin first (needed to use WebAudio graph on cross-origin media)
  try {
    a.crossOrigin = "anonymous";
    a.dataset.cross = "anonymous";
  } catch (e) {
    console.warn("Couldn't set crossOrigin on audio element:", e);
  }

  // Append before setting src to ensure event handlers are ready when loading begins
  document.body.appendChild(a);
  audioElemRef.current = a;

  // helper to set src + load
  const loadSrc = (src: string, withCross = true) => {
    try {
      if (withCross) {
        try {
          a.crossOrigin = "anonymous";
          a.dataset.cross = "anonymous";
        } catch {}
      } else {
        try {
          a.removeAttribute("crossorigin");
          a.dataset.cross = "nocors";
        } catch {}
      }
      // Only change src if different to avoid repeated reloads
      if (a.src !== src) a.src = src;
      // attempt to load
      try { a.load(); } catch (e) { console.warn("audio.load() threw:", e); }
    } catch (e) {
      console.warn("loadSrc error:", e);
    }
  };

  // set initial source (try with crossorigin first)
  loadSrc(MUSIC_URL, true);

  // event handlers to keep state and debugging info
  a.addEventListener("play", () => setIsPlaying(true));
  a.addEventListener("pause", () => setIsPlaying(false));

  a.addEventListener("canplay", () => {
    console.debug("Audio canplay — ready to play. currentSrc:", a.currentSrc, "crossOrigin:", a.getAttribute("crossorigin"));
  });

  a.addEventListener("loadedmetadata", () => {
    console.debug("Audio loadedmetadata:", { duration: a.duration, src: a.currentSrc, crossOrigin: a.getAttribute("crossorigin") });
  });

  a.addEventListener("stalled", () => {
    console.warn("Audio stalled while fetching data. Check network/CORS for:", a.currentSrc);
  });

  // Error event: log, show toast, and try a fallback without crossorigin (only once)
  a.addEventListener("error", (ev) => {
    console.error("HTMLAudio element error", ev, audioElemRef.current?.error, {
      src: a.currentSrc,
      crossOrigin: a.getAttribute("crossorigin"),
      dataset: { ...a.dataset },
    });

    // If a CORS-related failure happened while crossorigin was set, retry once without crossorigin.
    const alreadyRetried = a.getAttribute("data-retried-nocors") === "1";
    const hadCross = a.getAttribute("crossorigin") !== null;

    // Many CORS problems manifest as an error here but audio.play() may still succeed - retry without crossorigin to ensure WebAudio compatibility.
    if (!alreadyRetried && hadCross) {
      console.warn("Retrying audio load without 'crossorigin' attribute (attempt to fix CORS-related WebAudio errors).");
      try {
        a.setAttribute("data-retried-nocors", "1");
        a.removeAttribute("crossorigin");
      } catch (e) {
        console.warn("Failed to remove crossorigin attribute:", e);
      }
      // reload without crossorigin
      loadSrc(MUSIC_URL, false);
    }
    console.log("audioToastLockRef is .............",audioToastLockRef);

    if (!audioToastLockRef.current) {
      audioToastLockRef.current = true;
      toast.error("Audio element error. Check console/network/CORS.");
    }
  });

  // network troubleshooting helper (fires on fetch events)
  a.addEventListener("waiting", () => {
    console.debug("Audio waiting for more data; network might be slow or blocked. src:", a.currentSrc);
  });

  return a;
};


  const createAudioContextIfNeeded = async () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
    }
    if (!gainRef.current && audioCtxRef.current) {
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = isMuted ? 0 : volume;
      gain.connect(audioCtxRef.current.destination);
      gainRef.current = gain;
    }
    return audioCtxRef.current;
  };

  const connectMediaElementToAudioCtx = async (audioEl: HTMLAudioElement) => {
  try {
    if (!audioCtxRef.current) await createAudioContextIfNeeded();
    if (!audioCtxRef.current) return;

    // already wired
    if (mediaSourceRef.current) return;

    // If the audio is cross-origin (different origin from the page),
    // creating a MediaElementSource will taint the audio graph and produce zeroes.
    // Detect that and skip createMediaElementSource in that case.
    try {
      const src = audioEl.currentSrc || audioEl.src;
      if (src) {
        const audioOrigin = new URL(src).origin;
        const pageOrigin = window.location.origin;
        if (audioOrigin !== pageOrigin) {
          console.warn("Cross-origin audio detected; skipping createMediaElementSource to avoid CORS tainting.", { src });
          // Ensure we still have a gain node connected to destination so the rest of the code
          // can reference gainRef (though it won't control the audio element unless mediaSourceRef exists).
          if (!gainRef.current && audioCtxRef.current) {
            const g = audioCtxRef.current.createGain();
            g.gain.value = isMuted ? 0 : volume;
            g.connect(audioCtxRef.current.destination);
            gainRef.current = g;
          }
          // Use HTMLAudio element's volume as fallback for volume control
          audioEl.volume = isMuted ? 0 : volume;
          audioEl.muted = isMuted;
          return;
        }
      }
    } catch (err) {
      // If URL parsing fails, continue and attempt to create the source (will be caught below)
      console.warn("Could not determine audio origin; attempting to create MediaElementSource:", err);
    }

    // Best-effort: try to create media element source; if it throws, fall back to element volume
    try {
      const srcNode = audioCtxRef.current.createMediaElementSource(audioEl);
      mediaSourceRef.current = srcNode;

      if (!gainRef.current) {
        const g = audioCtxRef.current.createGain();
        g.gain.value = isMuted ? 0 : volume;
        g.connect(audioCtxRef.current.destination);
        gainRef.current = g;
      }

      mediaSourceRef.current.connect(gainRef.current);
    } catch (err) {
      console.warn("createMediaElementSource failed — falling back to HTMLAudio volume control. Error:", err);
      // fall back: ensure element volume matches app state
      try {
        audioEl.volume = isMuted ? 0 : volume;
        audioEl.muted = isMuted;
      } catch (e) {
        console.warn("Failed to set audio element volume/muted fallback:", e);
      }
    }
  } catch (err) {
    console.warn("connectMediaElementToAudioCtx error (non-fatal):", err);
  }
};


const handlePlayToggle = async () => {
  try {
    const audioEl = ensureAudioElem();

    // If currently playing -> pause
    if (!audioEl.paused && !audioEl.ended) {
      audioEl.pause();
      setIsPlaying(false);
      return;
    }

    // Try to play immediately on the user click (do this before awaits)
    let played = false;
    try {
      const playPromise = audioEl.play();
      if (playPromise && typeof (playPromise as any).then === "function") {
        await playPromise;
      }
      played = !audioEl.paused && !audioEl.ended;
    } catch (err) {
      console.warn("initial play() blocked or failed:", err);
    }

    // If normal play was blocked, try a muted-play fallback (user initiated click)
    if (!played) {
      try {
        audioEl.muted = true;
        await audioEl.play();
        // small delay, then unmute (user already clicked)
        setTimeout(() => {
          try {
            audioEl.muted = false;
            audioEl.volume = isMuted ? 0 : volume;
            if (gainRef.current) gainRef.current.gain.value = isMuted ? 0 : volume;
          } catch (e) { console.warn("unmute fallback failed:", e); }
        }, 250);
      } catch (err2) {
        console.error("muted fallback also failed:", err2);
        throw err2;
      }
    }

    // Create/resume AudioContext and connect (best-effort)
    try {
      await createAudioContextIfNeeded();
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        try { await audioCtxRef.current.resume(); } catch (e) { console.warn("resume failed:", e); }
      }
      await connectMediaElementToAudioCtx(audioEl);
      if (gainRef.current) gainRef.current.gain.value = isMuted ? 0 : volume;
      audioEl.volume = isMuted ? 0 : volume;
      audioEl.muted = isMuted;
    } catch (e) {
      console.warn("post-play audio context/connect failed (non-fatal):", e);
    }

    setIsPlaying(!audioEl.paused && !audioEl.ended);
  } catch (e: any) {
    console.error("handlePlayToggle error:", e);
    const name = e?.name ?? "";
    if (name === "NotAllowedError" || name === "NotSupportedError") {
      toast.error("Browser blocked playback. Try clicking the play button again or disable Brave Shields.");
    } else {
      toast.error("Audio couldn't start — check console for details.");
    }
  }
};


  const handleMuteToggle = async () => {
    try {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      const audioEl = audioElemRef.current;
      if (gainRef.current) {
        gainRef.current.gain.value = newMuted ? 0 : volume;
      }
      if (audioEl) {
        try {
          audioEl.muted = newMuted;
          audioEl.volume = newMuted ? 0 : volume;
          // If unmuting and audio isn't playing, attempt to play (user gesture required — but unmute clicked by user)
          if (!newMuted && (audioEl.paused || audioEl.ended)) {
            try {
              await audioEl.play();
              setIsPlaying(true);
            } catch (err) {
              // If this fails, ask user to explicitly press play
              console.warn("unmute attempted play failed:", err);
              toast("Audio unmuted — press play to start.", { duration: 3500 });
            }
          }
        } catch (err) {
          console.warn("failed to update audioEl mute/volume:", err);
        }
      }
    } catch (err) {
      console.error("handleMuteToggle failed:", err);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    try {
      if (gainRef.current) gainRef.current.gain.value = isMuted ? 0 : newVolume;
      if (audioElemRef.current) audioElemRef.current.volume = newVolume;
    } catch (err) {
      console.warn("handleVolumeChange warn:", err);
    }
  };

  // Pause & cleanup helper
  const stopPlayback = () => {
    try {
      if (audioElemRef.current && !audioElemRef.current.paused) {
        audioElemRef.current.pause();
      }
      setIsPlaying(false);
    } catch (err) {
      console.warn("stopPlayback failed:", err);
    }
  };

  useEffect(() => {
    return () => {
      try {
        stopPlayback();
        if (mediaSourceRef.current) {
          try {
            mediaSourceRef.current.disconnect();
          } catch {}
          mediaSourceRef.current = null;
        }
        if (gainRef.current) {
          try {
            gainRef.current.disconnect();
          } catch {}
          gainRef.current = null;
        }
        if (audioCtxRef.current) {
          try {
            audioCtxRef.current.close();
          } catch {}
          audioCtxRef.current = null;
        }
        if (audioElemRef.current) {
          try {
            audioElemRef.current.pause();
            if (audioElemRef.current.parentElement) audioElemRef.current.parentElement.removeChild(audioElemRef.current);
          } catch {}
          audioElemRef.current = null;
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`fixed bottom-6 left-6 z-40 glassmorphism rounded-2xl p-4 ${isDark ? "bg-slate-800/20 border border-white/10" : "bg-white/20 border border-gray-200/20"} shadow-2xl`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePlayToggle} 
            className={`p-3 rounded-xl transition-all duration-300 hover:scale-110 ${isPlaying ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" : isDark ? "bg-slate-700/50 text-slate-300" : "bg-white/50 text-gray-700"}`}
            aria-label={isPlaying ? "Pause music" : "Play music"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          
          <div className="flex items-center gap-2">
            <button onClick={handleMuteToggle} className={`p-2 rounded-lg ${isDark ? "text-slate-300 hover:text-white" : "text-gray-600 hover:text-gray-800"}`} aria-label="Toggle mute">
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 accent-purple-500"
            />
          </div>
          
          <div className="text-xs">
            <div className={`${isDark ? "text-white" : "text-gray-800"} font-medium`}>Web3 Vibes</div>
            <div className="text-gray-400">Background Music</div>
          </div>
        </div>
      </div>
  )
}

export default MusicComponent
