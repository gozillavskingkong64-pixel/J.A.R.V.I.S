import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';

// TODO: Security - this key is exposed to the browser. This needs to be proxied via a server-side WebSocket proxy.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

let globalAudioCtx: AudioContext | null = null;
let globalPlayCtx: AudioContext | null = null;

export function useJarvis() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{title: string, message: string} | null>(null);

  const setSystemError = useCallback((title: string, message: string) => {
    setErrorInfo({ title, message });
  }, []);

  const clearError = useCallback(() => {
    setErrorInfo(null);
  }, []);
  const [transcript, setTranscript] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  
  // Camera handling
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const [cameraStreamUrl, setCameraStreamUrl] = useState<MediaStream | null>(null);

  // Hologram Core Interaction
  const [coreAction, setCoreAction] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoStreamRef.current = stream;
      setCameraStreamUrl(stream);
      if (!videoRef.current) {
        videoRef.current = document.createElement('video');
        videoRef.current.autoplay = true;
      }
      videoRef.current.srcObject = stream;
      setIsVideoEnabled(true);

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      
      const sendFrames = () => {
        if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          videoIntervalRef.current = window.setTimeout(sendFrames, 1000);
          return;
        }
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = canvas.width * (video.videoHeight / video.videoWidth);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        const base64Data = dataUrl.split(',')[1];
        
        sessionRef.current.then((session: any) => {
          session.sendRealtimeInput({
            video: { data: base64Data, mimeType: 'image/jpeg' }
          });
        }).catch(() => {});
        
        // 1 frame per second
        videoIntervalRef.current = window.setTimeout(sendFrames, 1000);
      };
      videoIntervalRef.current = window.setTimeout(sendFrames, 1000);
    } catch (err) {
      console.error("Camera error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission dismissed") || msg.includes("Permission denied") || msg.includes("NotAllowedError") || err instanceof DOMException && err.name === "NotAllowedError") {
        setSystemError(
          "Camera Permission Required",
          "Please allow camera access for J.A.R.V.I.S to see the environment."
        );
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (videoIntervalRef.current) {
      clearTimeout(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }
    setCameraStreamUrl(null);
    setIsVideoEnabled(false);
  }, []);

  // Memory system
  const [memories, setMemories] = useState<string[]>([]);
  useEffect(() => {
    const stored = localStorage.getItem('jarvis_memories');
    if (stored) {
       try { setMemories(JSON.parse(stored)); } catch(e) {}
    }
  }, []);
  
  // Hologram system
  const [holograms, setHolograms] = useState<{id: string, title: string, content: string, htmlAnimationCode?: string, isZoomed?: boolean, lastModified?: number}[]>([]);

  const closeHologram = useCallback((id: string) => {
    setHolograms(prev => prev.filter(h => h.id !== id));
  }, []);

  // Audio state for animations
  const [volume, setVolume] = useState(0);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Playback queue and context
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const cleanupAudio = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'running') {
        audioContextRef.current.suspend().catch(() => {});
      }
      audioContextRef.current = null;
    }
    if (playbackContextRef.current) {
      if (playbackContextRef.current.state === 'running') {
        playbackContextRef.current.suspend().catch(() => {});
      }
      playbackContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        if (session && typeof session.close === 'function') {
          session.close();
        } else if (session && typeof session.disconnect === 'function') {
          session.disconnect();
        }
      }).catch(() => {});
      sessionRef.current = null;
    }
    stopCamera();
    setIsConnected(false);
    setIsConnecting(false);
    
    // Stop all active audio sources
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current.clear();
  }, []);

  const handleInterrupt = useCallback(() => {
    console.log("Jarvis Interrupted");
    // Stop playback
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current.clear();
    nextPlayTimeRef.current = 0;
  }, []);

  const playPcmAudio = useCallback((base64Audio: string) => {
    if (!playbackContextRef.current) return;
    const ctx = playbackContextRef.current;

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    
    let sum = 0;
    for (let i = 0; i < int16Array.length; i++) {
        const f = int16Array[i] / 0x7FFF;
        float32Array[i] = f;
        sum += Math.abs(f);
    }
    
    // Quick volume estimate for UI
    if (float32Array.length > 0) {
       setVolume(sum / float32Array.length);
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    
    if (analyserRef.current) {
        source.connect(analyserRef.current);
    } else {
        source.connect(ctx.destination);
    }
    
    // gapless playback
    const currentTime = ctx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
    
    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) setVolume(0);
    };
  }, []);

  const startJarvis = useCallback(async () => {
    try {
      clearError();
      setTranscript(''); // Clear previous transcript
      setUserTranscript(''); // Clear user transcript
      setIsConnecting(true);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (!globalAudioCtx) {
        globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      } else if (globalAudioCtx.state === 'suspended') {
        await globalAudioCtx.resume();
      }
      const audioCtx = globalAudioCtx;
      audioContextRef.current = audioCtx;
      
      if (!globalPlayCtx) {
        globalPlayCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } else if (globalPlayCtx.state === 'suspended') {
        await globalPlayCtx.resume();
      }
      const playCtx = globalPlayCtx;
      playbackContextRef.current = playCtx;
      nextPlayTimeRef.current = playCtx.currentTime;

      // Set up Analyser
      const analyser = playCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(playCtx.destination);
      analyserRef.current = analyser;
      
      const updateVolume = () => {
        if (!playbackContextRef.current) return;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128; // Normalize -1 to 1
          sum += val * val; // RMS
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        // Only update jarvis volume if Jarvis is playing
        if (activeSourcesRef.current.size > 0) {
           setVolume(rms);
        }
        
        if (sessionRef.current) {
          requestAnimationFrame(updateVolume);
        }
      };
      updateVolume();

      // Create session, now using WebSocket to connect to server-side proxy
      const connectWithFallback = async (models: string[]): Promise<any> => {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`wss://${location.host}/`);
            ws.onopen = () => {
                setIsConnected(true);
                setIsConnecting(false);
                
                // Set up audio capture once open
                const source = audioCtx.createMediaStreamSource(stream);
                const processor = audioCtx.createScriptProcessor(4096, 1, 1);
                
                processor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcm16 = new Int16Array(inputData.length);
                    
                    let sum = 0;
                    for (let j = 0; j < inputData.length; j++) {
                        pcm16[j] = Math.max(-1, Math.min(1, inputData[j])) * 0x7FFF;
                        sum += Math.abs(inputData[j]);
                    }
                    
                    if (activeSourcesRef.current.size === 0) {
                        setVolume(sum / inputData.length);
                    }

                    const buffer = new ArrayBuffer(pcm16.buffer.byteLength);
                    new Uint8Array(buffer).set(new Uint8Array(pcm16.buffer));
                    
                    let binary = '';
                    const bytes = new Uint8Array(buffer);
                    for (let j = 0; j < bytes.byteLength; j++) {
                        binary += String.fromCharCode(bytes[j]);
                    }
                    const base64 = btoa(binary);

                    ws.send(JSON.stringify({ audio: base64 }));
                };
                
                source.connect(processor);
                processor.connect(audioCtx.destination);
                scriptProcessorRef.current = processor;
                
                resolve(ws);
            };

            ws.onerror = (err) => reject(err);
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                if (message.serverContent?.interrupted) {
                    handleInterrupt();
                }

                const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio) {
                    playPcmAudio(base64Audio);
                }

                // Handle text transcription synchronization
                if (message.serverContent?.inputTranscription?.text) {
                    setUserTranscript(prev => prev + message.serverContent!.inputTranscription!.text! + " ");
                }

                if (message.serverContent?.outputTranscription?.text) {
                    setTranscript(prev => prev + message.serverContent!.outputTranscription!.text!);
                } else if (message.serverContent?.modelTurn?.parts) {
                    const modelTxt = message.serverContent.modelTurn.parts
                        .map((part: any) => part.text)
                        .filter(Boolean)
                        .join("");
                    if (modelTxt) {
                        setTranscript(prev => prev + modelTxt);
                    }
                }
                
                // Handle client-side tool executions
                if (message.toolCall) {
                    const functionCalls = message.toolCall.functionCalls;
                    if (functionCalls) {
                        const responsesAndPromises = functionCalls.map(async (call: any) => {
                            if (call.name === "saveMemory") {
                                const args = call.args as Record<string, any>;
                                if (args && args.memory) {
                                    setMemories((prev) => {
                                        const next = [...prev, args.memory];
                                        localStorage.setItem('jarvis_memories', JSON.stringify(next));
                                        return next;
                                    });
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "Memoria guardada exitosamente." }
                                };
                            }
                            
                            if (call.name === "googleSearch") {
                                const args = call.args as Record<string, any>;
                                const query = args?.query || "referencia 3D";
                                try {
                                    const searchRes = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                                    if (searchRes.ok) {
                                        const data = await searchRes.json();
                                        if (data.results && data.results.length > 0) {
                                            const formattedResults = data.results.map((r: any, idx: number) => 
                                                `[Fuentes #${idx + 1}] Título: ${r.title}\nURL: ${r.link}\nResumen: ${r.snippet}`
                                            ).join("\n\n");
                                            
                                            return {
                                                id: call.id,
                                                name: call.name,
                                                response: { result: `Resultados reales de búsqueda recuperados para: "${query}":\n\n${formattedResults}\n\nUsa estos datos, enlaces, descripciones, o fórmulas de diseño 3D para proyectar un holograma sumamente fiel y espectacular con Three.js en tu visualizador.` }
                                            };
                                        }
                                    }
                                } catch (searchErr) {
                                    console.error("Failed to fetch google search results:", searchErr);
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: `Búsqueda completada para '${query}'. No se retornaron resultados explícitos, pero procede con tu propio entendimiento de diseño 3D para lograr una geometría perfecta.` }
                                };
                            }
                            
                            if (call.name === "displayHologram") {
                                const args = call.args as Record<string, any>;
                                if (args && args.title && args.content) {
                                    setHolograms(prev => [...prev, {
                                        id: call.id || Math.random().toString(),
                                        title: args.title,
                                        content: args.content,
                                        htmlAnimationCode: args.htmlAnimationCode,
                                        isZoomed: args.isZoomed
                                    }]);
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "Holograma proyectado exitosamente en la interfaz." }
                                };
                            }

                            if (call.name === "modifyHologram") {
                                const args = call.args as Record<string, any>;
                                if (args && args.title && args.content) {
                                    setHolograms(prev => {
                                        let matchedIndex = -1;
                                        if (args.hologramId) {
                                            matchedIndex = prev.findIndex(h => h.id === args.hologramId);
                                        }
                                        if (matchedIndex === -1 && args.title) {
                                            matchedIndex = prev.findIndex(h => 
                                                h.title.toLowerCase().includes(args.title.toLowerCase()) ||
                                                args.title.toLowerCase().includes(h.title.toLowerCase())
                                            );
                                        }
                                        if (matchedIndex === -1 && prev.length > 0) {
                                            matchedIndex = prev.length - 1;
                                        }

                                        if (matchedIndex !== -1) {
                                            const updated = [...prev];
                                            updated[matchedIndex] = {
                                                ...updated[matchedIndex],
                                                title: args.title,
                                                content: args.content,
                                                htmlAnimationCode: args.htmlAnimationCode,
                                                isZoomed: args.isZoomed !== undefined ? args.isZoomed : updated[matchedIndex].isZoomed,
                                                lastModified: Date.now()
                                            };
                                            return updated;
                                        } else {
                                            return [...prev, {
                                                id: call.id || Math.random().toString(),
                                                title: args.title,
                                                content: args.content,
                                                htmlAnimationCode: args.htmlAnimationCode,
                                                isZoomed: args.isZoomed
                                            }];
                                        }
                                    });
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "Holograma modificado exitosamente con una transición fluida." }
                                };
                            }

                            if (call.name === "updateHologramZoom") {
                                const args = call.args as Record<string, any>;
                                if (args && args.titleFragment) {
                                    setHolograms(prev => prev.map(h => 
                                        h.title.toLowerCase().includes(String(args.titleFragment).toLowerCase()) 
                                        ? { ...h, isZoomed: args.isZoomed }
                                        : h
                                    ));
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "Zoom del holograma actualizado." }
                                };
                            }

                            if (call.name === "closeHologramDisplay") {
                                const args = call.args as Record<string, any>;
                                if (args && args.titleFragment) {
                                    setHolograms(prev => prev.filter(h => 
                                        !h.title.toLowerCase().includes(String(args.titleFragment).toLowerCase())
                                    ));
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "Holograma cerrado." }
                                };
                            }

                            if (call.name === "toggleCamera") {
                                const args = call.args as Record<string, any>;
                                const enable = args.enable;
                                if (enable) {
                                     startCamera();
                                } else {
                                     stopCamera();
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: enable ? "Cámara encendida. Ahora puedes ver al usuario." : "Cámara apagada." }
                                };
                            }

                            if (call.name === "moveHologramCore") {
                                const args = call.args as Record<string, any>;
                                if (args && args.action) {
                                    setCoreAction(args.action);
                                    setTimeout(() => setCoreAction(null), 2000); 
                                }
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "Acción visual aplicada al núcleo." }
                                };
                            }

                            if (call.name === "listGoogleDriveFiles" || call.name === "readGoogleSlidePresentation" || call.name === "modifyGoogleSlidePresentation") {
                                return {
                                    id: call.id,
                                    name: call.name,
                                    response: { result: "La API de Google Workspace no está vinculada en este momento." }
                                };
                            }

                            return {
                                id: call.id,
                                name: call.name,
                                response: { error: "Unknown tool" }
                            };
                        });
                        
                        Promise.all(responsesAndPromises).then(responses => {
                            ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
                        });
                    }
                }
            };
        });
      };

      const sessionPromise = connectWithFallback([
        "gemini-3.1-flash-live-preview",
        "gemini-2.0-flash-realtime-preview",
        "gemini-2.0-flash-exp"
      ]);
      
      sessionRef.current = sessionPromise;

      sessionPromise.catch((err) => {
        console.error("Fallback Failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        let errorTitle = "Initialization Failed";
        let errorMsg = msg.includes("unavailable") 
                ? "Service is temporarily unavailable. Please try again later." 
                : "Could not initialize audio capture or connect to the Live API.";

        if (msg.includes("Permission dismissed") || msg.includes("Permission denied") || msg.includes("NotAllowedError") || err instanceof DOMException && err.name === "NotAllowedError") {
          errorTitle = "Microphone Permission Required";
          errorMsg = "Please allow microphone access to use J.A.R.V.I.S. You may need to click the camera/microphone icon in your browser's address bar to unblock it.";
        }
        
        setSystemError(
          errorTitle,
          errorMsg
        );
        cleanupAudio();
      });

    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      let errorTitle = "Initialization Failed";
      let errorMsg = msg.includes("unavailable") 
              ? "Service is temporarily unavailable. Please try again later." 
              : "Could not initialize audio capture or connect to the Live API.";

      if (msg.includes("Permission dismissed") || msg.includes("Permission denied") || msg.includes("NotAllowedError") || err instanceof DOMException && err.name === "NotAllowedError") {
        errorTitle = "Microphone Permission Required";
        errorMsg = "Please allow microphone access to use J.A.R.V.I.S. You may need to click the camera/microphone icon in your browser's address bar to unblock it.";
      }
      
      setSystemError(
        errorTitle,
        errorMsg
      );
      cleanupAudio();
    }
  }, [cleanupAudio, playPcmAudio, handleInterrupt, memories]);

  return {
    isConnected,
    isConnecting,
    errorInfo,
    startJarvis,
    stopJarvis: cleanupAudio,
    clearError,
    transcript,
    userTranscript,
    volume,
    memories,
    holograms,
    closeHologram,
    isVideoEnabled,
    cameraStreamUrl,
    coreAction,
    startCamera,
    stopCamera
  };
}
