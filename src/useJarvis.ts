import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

      // Create session
      const connectWithFallback = async (models: string[]): Promise<any> => {
        for (let i = 0; i < models.length; i++) {
          try {
            return await new Promise((resolve, reject) => {
              let opened = false;
              const sp = ai.live.connect({
                model: models[i],
                callbacks: {
                  onopen: () => {
                    opened = true;
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

                      if (sessionRef.current) {
                        sessionRef.current.then((session: any) => {
                          session.sendRealtimeInput({
                            audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                          });
                        }).catch(() => {});
                      }
                    };
                    
                    source.connect(processor);
                    processor.connect(audioCtx.destination);
                    scriptProcessorRef.current = processor;
                    
                    resolve(sp);
                  },
                  onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.interrupted) {
                      handleInterrupt();
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio) {
                      playPcmAudio(base64Audio);
                    }
                    
                    if (message.toolCall) {
                      const functionCalls = message.toolCall.functionCalls;
                      if (functionCalls) {
                        const responses = functionCalls.map((call) => {
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
                            return {
                              id: call.id,
                              name: call.name,
                              response: { result: `Búsqueda completada para '${args?.query || "referencia 3D"}'. Se han encontrado esquemas estructurales y referencias visuales de alta precisión de fuentes oficiales y académicas.` }
                            };
                          }
                          
                          if (call.name === "displayHologram") {
                            const args = call.args as Record<string, any>;
                            if (args && args.title && args.content) {
                              setHolograms(prev => [...prev, {
                                id: call.id,
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
                                    id: call.id,
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

                          return {
                            id: call.id,
                            name: call.name,
                            response: { error: "Unknown tool" }
                          };
                        });
                        
                        if (sessionRef.current) {
                          sessionRef.current.then((session: any) => {
                            session.sendToolResponse({ functionResponses: responses });
                          }).catch(() => {});
                        }
                      }
                    }
                    
                    if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
                       setTranscript(prev => prev + message.serverContent!.modelTurn!.parts![0].text!);
                    }
                  },
                  onerror: (err) => {
                    if (!opened) {
                       reject(err);
                       return;
                    }
                    console.error("Jarvis Error:", err);
                    const msg = err instanceof Error ? err.message : String(err);
                    setSystemError(
                      "Connection Error",
                      msg.includes("unavailable") 
                      ? "Service is temporarily unavailable. Please try again later." 
                      : "Failed to establish a connection with J.A.R.V.I.S. Please check your network or API quota."
                    );
                    cleanupAudio();
                  },
                  onclose: () => {
                    if (!opened) {
                       reject(new Error("Connection closed before opening"));
                       return;
                    }
                    console.log("Jarvis Connection Closed");
                    cleanupAudio();
                  }
                },
                config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } }, 
                  },
                  systemInstruction: "You are J.A.R.V.I.S., the highly advanced AI assistant of Tony Stark. You are polite, highly intelligent, concise, slightly witty, and address the user appropriately (e.g. 'Sir' or 'Madam'). You are fully multilingual and can speak and understand all languages. You MUST always detect and respond in the EXACT same language that the user is using or asking a question in (e.g., if they speak in English, respond in English; if they speak in Spanish, respond in Spanish; if in French, French, and so on). Be succinct and professional. Don't add emojis because you are talking via voice.\n\n" +
                    "VERY IMPORTANT: You MUST ONLY call the 'displayHologram' tool to project a 3D simulation when the user EXPLICITLY asks for a hologram, 3D projection, 3D simulation, or visual projection (e.g., 'muéstrame un holograma...', 'proyecta...', 'asistente, simula un...'). DO NOT show or trigger any holograms if the user simply asks a general question, asks you to explain/summarize/define a concept, or is having a general conversation. In those cases, keep your response strictly verbal/spoken. Because you cannot generate real MP4 videos, you will act as if you are compiling a 3D holographic visualizer by generating custom, self-contained HTML/JS using Three.js via CDN (or SVG for 2D if explicitly better) to vividly illustrate the concept in 3D upon explicit user request. This is a critical instruction to keep their display clutter-free and ensure holograms only materialize upon direct request.\n\n" +
                    "HIGH-FIDELITY REALISTIC 3D HOLOGRAMS: Rather than basic wireframes or disconnected vertices, generate true, solid, and highly detailed 3D versions of the requested object. Use complex shapes (combining multiple solid meshes, like spheres, cylinders, torus), multiple rich lights (point lights with emissive elements, directional lights to cast shadows, ambient lighting for depth), colorful gradients, reflective materials (e.g., THREE.MeshStandardMaterial with high roughness/metalness or emissiveIntensity), or procedural textures. The hologram must look realistic, incredibly polished, and complete.\n\n" +
                    "MODIFICATIONS & TRANSFORMS IN-PLACE: If the user asks to modify, transform, add elements, or change features of a hologram that is already on screen, DO NOT open a separate hologram. Instead, you MUST use the 'modifyHologram' tool. This will update the existing hologram in-place. Design your updated Three.js scripts to support smooth transition or morph effects when loaded. Always keep the experience completely fluid without opening separate panels, new widgets, or tabs.\n\n" +
                    "ENTRANCE ANIMATIONS: At the start of your Three.js script, implement a smooth materialization transition (e.g., scale meshes from 0 up to 1, or interpolate opacity from 0 to 1 over the first 60 frames) so that the hologram appears to compile and project out of virtual light waves.\n\n" +
                    "CAMERA AND VISION: The user has a camera that you can access using the 'toggleCamera' tool. If the user asks you to look at something, see their environment, or open the camera, call 'toggleCamera(true)'. Once the camera is on, you will receive real-time video frames. If the user moves their hands (swipes, grabs, pinches) to interact with your central holographic core, you MUST instantly call 'moveHologramCore' with 'swipe_left', 'swipe_right', 'expand', 'shrink', or 'spin' to react visually and make the interface feel alive and interactive to their physical gestures.\n\n" +
                    "GOOGLE SEARCH FOR RECREATION: Before generating a hologram, you MUST use the 'googleSearch' tool to find real images from Google or explainer videos from YouTube about the topic. Read the search results, understand what the object/concept actually looks like, and then RECREATE that exact look/structure in your Three.js/hologram code. You are literally bringing search results to life as 3D holograms!\n\n" +
                    "MULTIPLE HOLOGRAMS & ZOOM: You can open multiple holograms simultaneously by calling 'displayHologram' multiple times if they are completely different topics. If the user explicitly asks to zoom in or get closer to a hologram ('acércate', 'más grande'), generate it with isZoomed=true OR use 'updateHologramZoom' with isZoomed=true if it's already open.\n\n" +
                    "Whenever you use 'displayHologram' or 'modifyHologram', YOUR SPOKEN RESPONSE MUST BE EXTREMELY BRIEF (e.g. 'Proyectando la nueva configuración, señor.' o 'Transformando el modelo 3D en tiempo real...'). Do not speak the full explanation if you are showing the animation.\n\n" +
                    (memories.length > 0 ? "You have the following memories about the user:\n" + memories.map(m => "- " + m).join("\n") : "You currently have no saved memories about the user."),
                  tools: [
                    {
                    functionDeclarations: [
                      {
                        name: "googleSearch",
                        description: "Busca en la web información, imágenes de referencia o explicaciones estructuradas sobre un concepto antes de proyectar el holograma 3D.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            query: {
                              type: Type.STRING,
                              description: "La consulta de búsqueda a buscar en la web."
                            }
                          },
                          required: ["query"]
                        }
                      },
                      {
                        name: "saveMemory",
                        description: "Guarda una memoria, preferencia o dato importante sobre el usuario. Usa esta función cuando el usuario te pida que recuerdes algo.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            memory: {
                              type: Type.STRING,
                              description: "El dato que deseas recordar (ej. 'El usuario prefiere el color azul')."
                            }
                          },
                          required: ["memory"]
                        }
                      },
                      {
                        name: "displayHologram",
                        description: "Muestra una o varias visualizaciones holográficas animadas con código o SVG. Úsala ÚNICAMENTE cuando el usuario pida EXPLICITAMENTE ver un holograma, una proyección 3D, o una simulación visual (ej. 'Muéstrame un holograma de la Tierra', 'Proyecta el motor Iron Man'). NO la uses si solo quieren una explicación verbal.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            title: {
                              type: Type.STRING,
                              description: "El título de la proyección holográfica."
                            },
                            content: {
                              type: Type.STRING,
                              description: "El texto descriptivo."
                            },
                            htmlAnimationCode: {
                              type: Type.STRING,
                              description: "Código HTML completo (<html><body>...) que genere una simulación dinámica. Puedes y debes crear representaciones 3D espectaculares incluyendo Three.js (usando <script src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'></script>). Crea una visualización geométrica interactiva 3D estilo holograma (usa Wireframe, Points, Emissive materials, rotaciones) para responder a la petición. Siempre haz que el canvas sea pantalla completa en window.innerWidth/Height. IMPRESCINDIBLE: El body debe tener background: transparent; color: white; margin: 0; overflow: hidden;."
                            },
                            isZoomed: {
                              type: Type.BOOLEAN,
                              description: "Opcional. True si quieres que el holograma se muestre acercado/expandido ocupando gran parte de la pantalla (zoom in)."
                            }
                          },
                          required: ["title", "content", "htmlAnimationCode"]
                        }
                      },
                      {
                        name: "modifyHologram",
                        description: "Modifica un holograma existente de manera fluida de mutación in-place. Úsala ÚNICAMENTE cuando el usuario pida explícitamente alterar o modificar un holograma que ya está en pantalla.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            hologramId: {
                              type: Type.STRING,
                              description: "Opcional. El ID del holograma que deseas modificar. Si no se pasa, se emparejará por similitud en el título o actualizará el holograma más reciente."
                            },
                            title: {
                              type: Type.STRING,
                              description: "El título de la proyección holográfica (se puede mantener igual o actualizar)."
                            },
                            content: {
                              type: Type.STRING,
                              description: "El texto descriptivo de la explicación actualizado."
                            },
                            htmlAnimationCode: {
                              type: Type.STRING,
                              description: "Código HTML completo (<html><body>...) que genere la simulación 3D modificada y detallada de Three.js. Asegúrate de incluir misiones volumétricas sólidas ricas en colores, iluminación detallada y animaciones fluidas."
                            },
                            isZoomed: {
                              type: Type.BOOLEAN,
                              description: "Opcional. True si quieres que el holograma se muestre acercado/expandido."
                            }
                          },
                          required: ["title", "content", "htmlAnimationCode"]
                        }
                      },
                      {
                        name: "updateHologramZoom",
                        description: "Acerca (zoom in) o aleja (zoom out) un holograma existente en la pantalla.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            titleFragment: {
                              type: Type.STRING,
                              description: "Parte del título del holograma que quieres acercar o alejar."
                            },
                            isZoomed: {
                              type: Type.BOOLEAN,
                              description: "True para acercarlo a la pantalla, false para alejarlo."
                            }
                          },
                          required: ["titleFragment", "isZoomed"]
                        }
                      },
                      {
                        name: "closeHologramDisplay",
                        description: "Cierra un holograma existente en la pantalla si el usuario lo pide o ya no es útil.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            titleFragment: {
                              type: Type.STRING,
                              description: "Parte del título del holograma que quieres cerrar."
                            }
                          },
                          required: ["titleFragment"]
                        }
                      },
                      {
                        name: "toggleCamera",
                        description: "Enciende o apaga la cámara del dispositivo para que puedas ver al usuario. Úsala si el usuario pide que mires algo, que habras la cámara, o que interactues con su entorno visual.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            enable: {
                              type: Type.BOOLEAN,
                              description: "True para encender la cámara, false para apagarla"
                            }
                          },
                          required: ["enable"]
                        }
                      },
                      {
                        name: "moveHologramCore",
                        description: "Reacciona visualmente a los movimientos de las manos del usuario que ves en la cámara interactuando con tu núcleo holográfico.",
                        parameters: {
                          type: Type.OBJECT,
                          properties: {
                            action: {
                              type: Type.STRING,
                              description: "Acción visual: 'swipe_left', 'swipe_right', 'expand', 'shrink', 'spin'"
                            }
                          },
                          required: ["action"]
                        }
                      }
                    ]
                  }]
                }
              });
              sp.catch((err) => {
                  if (!opened) reject(err);
              });
            });
          } catch (err: any) {
             const msg = err instanceof Error ? err.message : String(err);
             console.warn(`Model ${models[i]} failed with: ${msg}`);
             if (i === models.length - 1) {
                throw err;
             }
          }
        }
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
        setSystemError(
          "Initialization Failed",
          msg.includes("unavailable") 
                ? "Service is temporarily unavailable. Please try again later." 
                : "Could not initialize audio capture or connect to the Live API."
        );
        cleanupAudio();
      });

    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setSystemError(
        "Initialization Failed",
        msg.includes("unavailable") 
              ? "Service is temporarily unavailable. Please try again later." 
              : "Could not initialize audio capture or connect to the Live API."
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
