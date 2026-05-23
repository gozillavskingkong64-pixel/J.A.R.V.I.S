/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { Camera, CameraOff, Mic, MicOff, AlertCircle, X } from "lucide-react";
import { useJarvis } from "./useJarvis";
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from 'react-markdown';

import { useHandCursor, ScreenLandmark } from "./useHandCursor";

function HologramNode({ hologram, index, closeHologram, handCursor }: { hologram: any, index: number, closeHologram: (id: string) => void, handCursor: any }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState({ x: hologram.isZoomed ? 0 : index * 2, y: hologram.isZoomed ? 0 : -index * 2, z: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const prevCodeRef = useRef(hologram.htmlAnimationCode);

  useEffect(() => {
    if (prevCodeRef.current !== hologram.htmlAnimationCode) {
      prevCodeRef.current = hologram.htmlAnimationCode;
      setIsTransforming(true);
      const timer = setTimeout(() => {
        setIsTransforming(false);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [hologram.htmlAnimationCode]);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (Math.abs(e.deltaY) > 0) {
      setScale(s => Math.min(Math.max(0.5, s - e.deltaY * 0.002), 3));
    }
    if (Math.abs(e.deltaX) > 0) {
      // used for rotation via hand gesture
      setRotation(r => ({ ...r, z: r.z + e.deltaX * 0.1 }));
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.buttons === 2) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 2) {
      setRotation(r => ({ ...r, x: r.x - e.movementY * 0.5, y: r.y + e.movementX * 0.5 }));
    }
  };

  const effectiveScale = isHovered && handCursor ? scale * 1.15 : scale;

  return (
    <motion.div 
      drag
      dragMomentum={false}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onContextMenu={(e) => e.preventDefault()}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: hologram.isZoomed ? 1 : effectiveScale, 
        y: 0,
        zIndex: hologram.isZoomed ? 70 : (isHovered ? 65 : 60 + index),
        rotateX: rotation.x,
        rotateY: rotation.y,
        rotateZ: rotation.z,
        x: hologram.isZoomed ? 0 : index * 10,
        boxShadow: isHovered && handCursor ? "0 0 80px rgba(59, 130, 246, 0.4)" : "none"
      }}
      exit={{ opacity: 0, scale: 0.95, y: -20 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={`fixed ${hologram.isZoomed ? 'inset-1 sm:inset-4 md:inset-8 z-[70]' : 'top-[20%] left-[20%] w-[60%] sm:w-[40%] md:w-[60%] z-[60]'} flex flex-col items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing`}
      style={{ 
        transformPerspective: 1000,
        marginLeft: hologram.isZoomed ? 0 : index * 10,
        marginTop: hologram.isZoomed ? 0 : index * 10
      }}
    >
      {/* Minimal Close Button */}
      <button 
        onClick={(e) => {
          e.stopPropagation();
          closeHologram(hologram.id);
        }}
        className="absolute -top-4 -right-4 md:-top-6 md:-right-6 w-8 h-8 rounded-full bg-blue-900/40 border border-blue-500/50 text-blue-400 hover:bg-red-500/50 hover:text-white transition-all flex items-center justify-center z-[80]"
        title="Cerrar Holograma"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Hologram Content */}
      <div className={`w-full flex ${hologram.isZoomed ? 'flex-col md:flex-row h-full' : 'flex-col'} gap-6 items-center`}>
        {hologram.htmlAnimationCode && (
          <div className={`relative ${hologram.isZoomed ? 'w-full md:w-2/3 h-full' : 'w-full aspect-video'} overflow-hidden rounded-xl bg-transparent`}>
             <iframe 
                className="absolute top-0 left-0 w-full h-full mix-blend-screen pointer-events-none"
                srcDoc={hologram.htmlAnimationCode}
                title="JARVIS Projection" 
                sandbox="allow-scripts allow-same-origin"
                frameBorder="0" 
              />
              
              {/* Sci-Fi Energy Transformation Transition Overlay */}
              <AnimatePresence>
                {isTransforming && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 bg-cyan-950/20 backdrop-blur-[6px] border border-cyan-500/30 rounded-xl flex flex-col items-center justify-center pointer-events-none z-10"
                  >
                    {/* Ring Assembly Line */}
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <motion.div 
                        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                        className="absolute inset-0 border-2 border-dashed border-cyan-400 opacity-60 rounded-full"
                      />
                      <motion.div 
                        animate={{ rotate: -360, scale: [1, 0.9, 1] }}
                        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                        className="absolute w-24 h-24 border border-cyan-300 opacity-40 rounded-full"
                      />
                      <motion.div 
                        animate={{ scale: [0.7, 1.2, 0.7] }}
                        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                        className="w-12 h-12 bg-cyan-400/20 shadow-[0_0_20px_rgba(34,211,238,0.6)] rounded-full border border-cyan-400"
                      />
                    </div>
                    
                    {/* Scanning Line Sweep */}
                    <motion.div 
                      initial={{ y: "0%" }}
                      animate={{ y: ["0%", "100%", "0%"] }}
                      transition={{ duration: 1.8, ease: "easeInOut", repeat: 1 }}
                      className="absolute left-0 right-0 h-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] opacity-70"
                    />

                    {/* Laser scanning sparkles / particles overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-[105%] h-[105%] border-2 border-double border-cyan-400/20 rounded-2xl animate-pulse" />
                    </div>

                    <div className="mt-4 flex flex-col items-center">
                      <span className="text-cyan-400 font-mono text-xs tracking-[0.2em] uppercase font-bold animate-pulse">
                        Sincronizando Holograma...
                      </span>
                      <span className="text-cyan-500 font-mono text-[9px] mt-1 uppercase tracking-wider opacity-60">
                        Remapeando geometría 3D en tiempo real
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>
        )}
        {hologram.content && (
          <div className={`prose prose-invert prose-blue prose-sm sm:prose-base font-sans text-blue-100/90 text-shadow-sm ${hologram.isZoomed ? 'w-full md:w-1/3 overflow-y-auto select-text' : 'max-w-prose bg-black/30 backdrop-blur-[2px] p-4 rounded-xl border border-blue-500/20'} pointer-events-none`}>
            <ReactMarkdown>{hologram.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function VideoBackground({ stream, setVideoElement }: { stream: MediaStream, setVideoElement: (el: HTMLVideoElement | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      setVideoElement(videoRef.current);
    }
  }, [stream, setVideoElement]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="absolute inset-0 pointer-events-none z-[1] overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      {/* Subtle overlay only at the very bottom to ensure text readability if needed */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
    </motion.div>
  );
}

export default function App() {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  const { 
    isConnected, 
    isConnecting, 
    errorInfo, 
    startJarvis, 
    stopJarvis, 
    clearError,
    volume,
    transcript,
    memories,
    holograms,
    closeHologram,
    isVideoEnabled,
    cameraStreamUrl,
    coreAction,
    startCamera,
    stopCamera
  } = useJarvis();

  const [uptime, setUptime] = useState("00:00:00:00");
  const handleSeparationGesture = useCallback(() => {
    // Zoom out / space out all holograms to "separate" them
    holograms.forEach(h => closeHologram(h.id));
  }, [holograms, closeHologram]);

  const { cursors, skeletons } = useHandCursor(videoElement, isVideoEnabled, handleSeparationGesture);
  
  // Hand skeleton connections
  const HAND_CONNECTIONS = [
     [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
     [0, 5], [5, 6], [6, 7], [7, 8], // Index
     [5, 9], [9, 10], [10, 11], [11, 12], // Middle
     [9, 13], [13, 14], [14, 15], [15, 16], // Ring
     [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
     [0, 17] // Palm bottom
  ];

  useEffect(() => {
    const start = Date.now();
    const intv = setInterval(() => {
      const diff = Date.now() - start;
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setUptime(`${d.toString().padStart(2, '0')}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(intv);
  }, []);

  const baseScale = 1;
  const audioScale = Math.min(volume * 10, 1.5);
  const scale = baseScale + audioScale;

  const isIdle = !isConnected && !isConnecting;

  const getCoreAnimation = () => {
    const defaultPosition = isVideoEnabled ? { x: "-35vw", y: "30vh", scale: 0.25, rotateY: 0, rotate: 0, opacity: 0.8 } : { x: 0, scale: 1, rotateY: 0, rotate: 0, opacity: 1 };
    
    switch (coreAction) {
      case 'swipe_left': return { ...defaultPosition, x: isVideoEnabled ? "-40vw" : -150, rotateY: -45, opacity: 0.5 };
      case 'swipe_right': return { ...defaultPosition, x: isVideoEnabled ? "-30vw" : 150, rotateY: 45, opacity: 0.5 };
      case 'expand': return { ...defaultPosition, scale: isVideoEnabled ? 0.35 : 1.5, rotate: 180 };
      case 'shrink': return { ...defaultPosition, scale: isVideoEnabled ? 0.15 : 0.5, rotate: -180 };
      case 'spin': return { ...defaultPosition, rotate: 360, scale: isVideoEnabled ? 0.3 : 1.2 };
      default: return defaultPosition;
    }
  };

  return (
    <motion.div 
      className="w-full h-screen text-white font-sans overflow-hidden relative flex flex-col justify-between p-4 md:p-10 select-none perspective-1000"
      animate={{ backgroundColor: isIdle ? "#00030a" : "#050505" }}
      transition={{ duration: 1.5 }}
    >
      
      {/* Invisible Full-Screen Click Target for Idle State */}
      {isIdle && (
        <div className="absolute inset-0 z-[200] cursor-pointer" onClick={startJarvis} />
      )}

      {/* Background Tech Patterns */}
      <motion.div 
        className="absolute inset-0 pointer-events-none z-0"
        animate={{ opacity: isIdle ? 0 : 0.1 }}
        transition={{ duration: 1.5 }}
      >
        <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: "radial-gradient(#1e3a8a 1px, transparent 1px)", backgroundSize: "32px 32px" }}></div>
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at center, transparent 0%, #050505 80%)" }}></div>
      </motion.div>

      <AnimatePresence>
        {isVideoEnabled && cameraStreamUrl && <VideoBackground stream={cameraStreamUrl} setVideoElement={setVideoElement} />}
      </AnimatePresence>

      <AnimatePresence>
        {isVideoEnabled && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-[2]"
          />
        )}
      </AnimatePresence>

      {/* Top Navigation / Status Bar */}
      <motion.div 
        className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-blue-900/30 pb-4 md:pb-6 gap-4"
        animate={{ opacity: isIdle ? 0 : 1, y: isIdle ? -20 : 0 }}
        transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ pointerEvents: isIdle ? 'none' : 'auto' }}
      >
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.3em] text-blue-400 font-bold mb-1">System Protocol</span>
          <h1 className="text-xl md:text-2xl font-light tracking-tighter italic">J.A.R.V.I.S. <span className="text-blue-500 font-bold ml-2 text-sm not-italic uppercase tracking-widest">Mark VII</span></h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-8 text-left md:text-right w-full md:w-auto">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-blue-400/50 mb-1">Uptime</span>
            <span className="font-mono text-xs md:text-sm">{uptime}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-blue-400/50 mb-1">Connection</span>
            <span className={`font-mono text-xs md:text-sm ${isConnected ? "text-green-400" : "text-red-400"}`}>{isConnected ? "STABLE" : "OFFLINE"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-blue-400/50 mb-1">Memories</span>
            <span className="font-mono text-xs md:text-sm">{memories.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-blue-400/50 mb-1">Power</span>
            <span className="font-mono text-xs md:text-sm">OPTIMAL</span>
          </div>
        </div>
      </motion.div>

      {/* Central Interface / Logo */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">

        {/* Error Modal */}
        <AnimatePresence>
          {errorInfo && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-red-950/40 border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
                
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-red-900/40 rounded-full border border-red-500/30 shrink-0">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-red-300 font-mono font-bold tracking-widest uppercase text-sm mb-1">{errorInfo.title}</h3>
                    <p className="text-red-100/80 text-sm leading-relaxed">{errorInfo.message}</p>
                  </div>
                </div>

                <div className="flex justify-end mt-4 pt-4 border-t border-red-500/20">
                  <button 
                    onClick={clearError}
                    className="px-6 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 font-mono text-xs uppercase tracking-widest rounded border border-red-500/30 transition-colors"
                  >
                    Acknowledge
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* The Core Container */}
        <motion.div 
          className="relative flex items-center justify-center w-[300px] h-[300px] md:w-[400px] md:h-[400px]"
          animate={isIdle ? { x: 0, scale: 1, rotateY: 0, rotate: 0, opacity: 1 } : getCoreAnimation()}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Transformative Background (Horizon Arc -> Core Shadow) */}
          <motion.div
            className="absolute rounded-[100%] flex items-center justify-center pointer-events-none"
            animate={{
              width: isIdle ? "200vw" : "100%",
              height: isIdle ? "200vw" : "100%",
              y: isIdle ? "60vh" : 0,
              backgroundColor: isIdle ? "#01030a" : "transparent",
              boxShadow: isIdle 
                ? "0 -30px 200px -20px rgba(56, 189, 248, 0.4), inset 0 20px 80px -10px rgba(56, 189, 248, 0.2)"
                : "0 0 0px 0px rgba(56, 189, 248, 0)",
              borderTop: isIdle ? "4px solid rgba(186, 230, 253, 0.9)" : "0px solid rgba(186, 230, 253, 0)",
            }}
            transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* JARVIS Rings and Active HUD */}
          <motion.div 
            className="absolute inset-0 flex items-center justify-center cursor-pointer group" 
            onClick={isConnected ? stopJarvis : startJarvis}
            animate={{ scale: isIdle ? 0.8 : 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            whileHover={!isIdle ? { scale: 1.05 } : {}}
            whileTap={!isIdle ? { scale: 0.95 } : {}}
            style={{ pointerEvents: isIdle ? 'none' : 'auto' }}
          >
            {/* Outer Rotating Rings */}
          <motion.div 
            className="absolute inset-0 border-2 border-dashed border-blue-500/20 rounded-full group-hover:border-blue-400/50 transition-colors"
            animate={{ 
              rotate: isConnected ? 360 : 0,
              scale: isConnected ? 1 + (scale - 1) * 0.2 : 1,
              opacity: isIdle ? 0 : 1
            }}
            transition={{ opacity: { duration: 1.2 }, rotate: { duration: 30, repeat: Infinity, ease: "linear" }, scale: { type: "spring", bounce: 0.5 } }}
          />
          <motion.div 
            className="absolute inset-6 md:inset-8 border border-blue-400/10 rounded-full group-hover:border-blue-400/40 transition-colors"
            animate={{
              rotate: isConnected ? -180 : 0,
              scale: isConnected ? 1 + (scale - 1) * 0.3 : 1,
              boxShadow: isConnected ? `0 0 ${20 + (scale - 1) * 100}px rgba(59, 130, 246, ${0.1 + (scale - 1) * 0.5})` : "",
              opacity: isIdle ? 0 : 1
            }}
            transition={{ opacity: { duration: 1.2 }, rotate: { duration: 40, repeat: Infinity, ease: "linear" }, scale: { type: "spring", bounce: 0.5 } }}
          />
          <motion.div 
            className="absolute inset-12 md:inset-16 border-t-4 border-b-4 border-l-2 border-r-2 border-transparent border-t-blue-500/40 border-b-blue-500/40 rounded-full group-hover:border-t-blue-400/60 group-hover:border-b-blue-400/60 group-hover:border-r-blue-400/20 group-hover:border-l-blue-400/20 transition-colors"
            animate={{ 
              rotate: isConnected ? -360 : 0,
              scale: isConnected ? 1 + (scale - 1) * 0.5 : 1,
              opacity: isIdle ? 0 : 1
            }}
            transition={{ opacity: { duration: 1.2 }, rotate: { duration: 20, repeat: Infinity, ease: "linear" }, scale: { type: "spring", bounce: 0.5 } }}
          />
          
          {/* Inner Data Circle / Logo */}
          <div className="relative w-36 h-36 md:w-48 md:h-48 flex items-center justify-center z-10 pointer-events-none">
            {/* Wavy Ring Layer 1 (Outer Blue) */}
            <motion.div
              className="absolute -inset-4 md:-inset-6"
              animate={{ 
                scale: isConnected ? 1 + volume * 1.5 : 1,
                opacity: isIdle ? 0 : 1 
              }}
              transition={{ type: "spring", bounce: 0, duration: 0.1, opacity: { duration: 1.2, ease: "easeInOut" } }}
            >
              <motion.div 
                className="w-full h-full border-[3px] border-blue-500/80 rounded-[40%_60%_70%_30%/40%_50%_60%_50%] mix-blend-screen filter blur-[2px]"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 8 }}
                style={{
                  boxShadow: `0 0 ${40 + volume * 150}px rgba(37,99,235,${0.3 + volume})`,
                  borderColor: `rgba(59, 130, 246, ${0.4 + volume})`
                }}
              />
            </motion.div>

            {/* Wavy Ring Layer 2 (Indigo) */}
            <motion.div
              className="absolute -inset-2 md:-inset-4"
              animate={{ 
                scale: isConnected ? 1 + volume * 2.0 : 1,
                opacity: isIdle ? 0 : 1
              }}
              transition={{ type: "spring", bounce: 0, duration: 0.1, opacity: { duration: 1.2, ease: "easeInOut" } }}
            >
              <motion.div 
                className="w-full h-full border-[4px] border-indigo-400/60 rounded-[60%_40%_30%_70%/60%_30%_70%_40%] mix-blend-screen filter blur-[4px]"
                animate={{ rotate: -360 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 12 }}
                style={{
                  boxShadow: `0 0 ${60 + volume * 200}px rgba(99,102,241,${0.2 + volume})`,
                  borderColor: `rgba(99, 102, 241, ${0.3 + volume})`
                }}
              />
            </motion.div>

            {/* Wavy Ring Layer 3 (Inner Cyan) */}
            <motion.div
              className="absolute inset-0 md:-inset-1"
              animate={{ 
                scale: isConnected ? 1 + volume * 1.2 : 1,
                opacity: isIdle ? 0 : 1
              }}
              transition={{ type: "spring", bounce: 0, duration: 0.1, opacity: { duration: 1.2, ease: "easeInOut" } }}
            >
              <motion.div 
                className="w-full h-full border-[2px] border-cyan-300/90 rounded-[50%_50%_40%_60%/40%_60%_50%_50%] mix-blend-screen filter blur-[1px]"
                animate={{ rotate: 180 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 15 }}
                style={{
                  boxShadow: `0 0 ${20 + volume * 100}px rgba(103,232,249,${0.4 + volume})`,
                  borderColor: `rgba(103, 232, 249, ${0.5 + volume})`
                }}
              />
            </motion.div>

            {/* The "J" Container */}
            <motion.div 
              className="relative flex items-center justify-center z-10 w-24 h-24 md:w-32 md:h-32 rounded-full border border-blue-400/20 backdrop-blur-sm pointer-events-auto"
              animate={{
                backgroundColor: isIdle ? "rgba(0, 0, 0, 0)" : "rgba(0, 0, 0, 0.6)",
                boxShadow: isIdle 
                  ? "0 0 40px rgba(56, 189, 248, 0.3), inset 0 0 20px rgba(56, 189, 248, 0.2)" 
                  : "inset 0 2px 4px rgba(0,0,0,0.6)",
                borderColor: isIdle ? "rgba(186, 230, 253, 0.4)" : "rgba(96, 165, 250, 0.2)"
              }}
              transition={{ duration: 1.2 }}
            >
              {isConnecting ? (
                  <div className="w-10 h-10 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              ) : (
                  <motion.div 
                    className="text-white text-5xl md:text-7xl font-black italic tracking-tighter filter drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                    animate={{ scale: 1 + volume * 0.2 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.1 }}
                  >
                    J
                  </motion.div>
              )}
            </motion.div>
          </div>

          {/* Decorative HUD Elements */}
          <motion.div className="absolute top-0 right-0 border-t border-r border-blue-500/30 w-12 h-12 md:w-16 md:h-16 pointer-events-none" animate={{ opacity: isIdle ? 0 : 1 }} transition={{ duration: 1.2 }} />
          <motion.div className="absolute bottom-0 left-0 border-b border-l border-blue-500/30 w-12 h-12 md:w-16 md:h-16 pointer-events-none" animate={{ opacity: isIdle ? 0 : 1 }} transition={{ duration: 1.2 }} />

          {/* Compass/Coordinate Tags - Hidden on small mobile */}
          <motion.div 
            className="hidden sm:flex absolute -left-12 md:-left-20 top-1/2 -translate-y-1/2 flex-col gap-4 text-[10px] font-mono text-blue-300/40 uppercase tracking-widest pointer-events-none"
            animate={{ opacity: isIdle ? 0 : 1 }} 
            transition={{ duration: 1.2 }}
          >
            <span>Decryp: 104.2</span>
            <span>Freq: 4.88 GHz</span>
            <span>Auth: {isConnected ? "verified" : "pending"}</span>
          </motion.div>
          
          </motion.div>
        </motion.div>

        {/* Voice Interaction Waveform */}
        <AnimatePresence>
          {!isIdle && (
            <motion.div 
              className="mt-8 relative w-full md:w-[600px] h-16 md:h-24 flex items-center justify-center gap-1.5 opacity-80 px-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {isConnected && [0.3, 0.6, 1, 1.2, 0.8, 1.5, 0.9, 1.2, 0.6, 0.4, 0.8, 1.1, 0.5, 1.2, 0.7].map((mult, i) => (
                <motion.div 
                  key={i}
                  className="flex-1 max-w-[4px] bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.8)]"
                  animate={{ height: Math.max(4, volume * 100 * mult) }}
                  transition={{ type: "spring", bounce: 0, duration: 0.1 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!isIdle && (
            <motion.div 
              className="mt-4 flex flex-col items-center px-4 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="text-blue-400 uppercase tracking-[0.4em] font-bold text-[10px] md:text-xs mb-2">
                {isConnecting ? "Inicializando..." : isConnected ? "Escuchando..." : "Sistema en espera"}
              </div>
              <div className="text-white/60 text-xs md:text-sm font-light italic min-h-[1.5rem]">
                {transcript ? `"${transcript}"` : (isConnected ? "Hable ahora, señor..." : "")}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <AnimatePresence>
          {!isIdle && (
            <motion.div 
              className="mt-8 z-10 flex flex-col items-center gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex gap-4 items-center">
                <button
                  onClick={isConnected ? stopJarvis : startJarvis}
                  disabled={isConnecting}
                  className={`
                    relative group flex items-center gap-3 px-6 md:px-8 py-3 rounded border overflow-hidden transition-all duration-300
                    ${isConnected 
                      ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40 border-red-500/30' 
                      : 'bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border-blue-500/30'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {isConnecting ? (
                    <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  ) : isConnected ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                  
                  <span className="font-mono text-[10px] tracking-widest uppercase font-bold">
                    {isConnecting ? "Conectando..." : isConnected ? "Desactivar" : "Iniciar"}
                  </span>
                </button>
                
                {isConnected && (
                  <button
                    onClick={isVideoEnabled ? stopCamera : startCamera}
                    className={`
                      relative group flex items-center gap-3 px-4 py-3 rounded border overflow-hidden transition-all duration-300
                      ${isVideoEnabled 
                        ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border-blue-400/50' 
                        : 'bg-white/5 text-white/50 hover:bg-white/10 border-white/10'}
                    `}
                    title={isVideoEnabled ? "Apagar Cámara" : "Encender Cámara"}
                  >
                    {isVideoEnabled ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Hologram Overlay - Floating holograms */}
      <AnimatePresence>
        {holograms.map((hologram, index) => (
          <HologramNode key={hologram.id} hologram={hologram} index={index} closeHologram={closeHologram} handCursor={cursors.some(c => c.isOpen)} />
        ))}
      </AnimatePresence>

      {/* Virtual Hand Cursors & Skeletons */}
      <AnimatePresence>
        {skeletons.map((skeleton, i) => (
           <svg key={`skeleton-${i}`} className="fixed inset-0 pointer-events-none z-[100] w-full h-full">
              {HAND_CONNECTIONS.map(([start, end], j) => (
                 <line 
                   key={`line-${i}-${j}`}
                   x1={skeleton[start].x} y1={skeleton[start].y}
                   x2={skeleton[end].x} y2={skeleton[end].y}
                   stroke="rgba(59, 130, 246, 0.4)" strokeWidth="2"
                 />
              ))}
              {skeleton.map((lm, k) => (
                 <circle 
                   key={`point-${i}-${k}`}
                   cx={lm.x} cy={lm.y} r="3"
                   fill={k === 8 || k === 4 ? "rgba(96, 165, 250, 0.9)" : "rgba(59, 130, 246, 0.7)"} // Highlight index and thumb tip
                 />
              ))}
           </svg>
        ))}

        {cursors.filter(c => c.isVisible).map(cursor => (
          <motion.div
            key={`cursor-${cursor.id}`}
            className="fixed z-[101] w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none mix-blend-screen"
            animate={{ 
              x: cursor.x, 
              y: cursor.y,
              scale: cursor.isPinching ? 0.6 : 1,
              backgroundColor: cursor.isPinching ? "rgba(59, 130, 246, 0.8)" : "rgba(59, 130, 246, 0.2)"
            }}
            transition={{ type: "spring", stiffness: 500, damping: 25, mass: 0.5 }}
          >
             {cursor.isPinching && (
               <motion.div 
                 initial={{ scale: 0, opacity: 0 }}
                 animate={{ scale: 2, opacity: 0 }}
                 transition={{ duration: 0.5, ease: "easeOut" }}
                 className="absolute inset-0 rounded-full border border-blue-400"
               />
             )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Footer Controls */}
      <div className="relative z-10 flex flex-col sm:flex-row justify-between items-center sm:items-end gap-6 sm:gap-0 mt-4">
        <div className="flex gap-4">
          <div 
             onClick={isConnected ? stopJarvis : startJarvis}
             className="w-10 h-10 rounded-full border border-blue-500/50 flex items-center justify-center cursor-pointer hover:bg-blue-900/20 transition-all group"
          >
            {isConnected ? (
                <div className="w-3 h-3 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)]"></div>
            ) : (
                <div className="w-3 h-3 bg-blue-400 group-hover:scale-110 transition-transform"></div>
            )}
          </div>
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center cursor-default opacity-30">
            <div className="w-3 h-3 border-2 border-white rounded-full"></div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto">
          <div className="text-center sm:text-right flex flex-col w-full sm:w-auto">
            <span className="text-[10px] uppercase text-blue-400/50">Ambient Sound Level</span>
            <div className="w-full sm:w-32 h-1 bg-white/10 mt-2 overflow-hidden rounded-full">
              <motion.div 
                className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,1)]"
                animate={{ width: `${Math.min(maxAudio(volume), 100)}%` }}
                initial={{ width: '0%' }}
              />
            </div>
          </div>
          <div className="px-4 py-2 bg-blue-600/10 border border-blue-500/50 rounded text-[10px] uppercase tracking-widest font-bold text-blue-400 whitespace-nowrap">
            Auto-Mic: Enabled
          </div>
        </div>
      </div>

      {/* Decorative Sidebars - Hidden on mobile */}
      <div className="hidden md:block absolute left-6 top-1/3 bottom-1/3 w-[1px] bg-gradient-to-b from-transparent via-blue-500/50 to-transparent pointer-events-none"></div>
      <div className="hidden md:block absolute right-6 top-1/3 bottom-1/3 w-[1px] bg-gradient-to-b from-transparent via-blue-500/50 to-transparent pointer-events-none"></div>
      
      <div className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 flex-col gap-2 pointer-events-none">
        <div className="w-1 h-1 bg-blue-400"></div>
        <div className="w-1 h-1 bg-blue-400/50"></div>
        <div className="w-1 h-1 bg-blue-400/20"></div>
      </div>

      {memories.length > 0 && (
        <div className="hidden lg:flex absolute left-10 top-1/2 -translate-y-1/2 flex-col gap-2 pointer-events-none max-w-xs">
          <div className="text-[10px] uppercase text-blue-400/50 tracking-widest mb-2 border-b border-blue-900/30 pb-1">Bancos de Memoria</div>
          {memories.slice(-4).map((mem, i) => (
             <div key={i} className="text-xs font-mono text-blue-300/60 break-words border-l-2 border-blue-500/20 pl-2 py-0.5">
                {mem}
             </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function maxAudio(volume: number) {
   return volume * 200;
}
