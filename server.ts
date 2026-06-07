import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

async function performWebSearch(query: string) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      }
    });
    
    if (!response.ok) {
      throw new Error(`DuckDuckGo response status: ${response.status}`);
    }
    
    const html = await response.text();
    const resultBlocks: { title: string, link: string, snippet: string }[] = [];
    
    const blockRegex = /<div class="[^"]*result__body[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    while ((match = blockRegex.exec(html)) !== null && resultBlocks.length < 5) {
      const blockHtml = match[1];
      
      const titleMatch = /<a class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(blockHtml);
      const snippetMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(blockHtml);
      
      if (titleMatch) {
        let link = titleMatch[1];
        if (link.includes("uddg=")) {
          const uddgParam = link.split("uddg=")[1];
          if (uddgParam) {
            link = decodeURIComponent(uddgParam.split("&")[0]);
          }
        }
        
        const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : "";
        
        if (title && link) {
          resultBlocks.push({ title, link, snippet });
        }
      }
    }
    
    if (resultBlocks.length === 0) {
      const fallbackRegex = /<a class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let fbMatch;
      while ((fbMatch = fallbackRegex.exec(html)) !== null && resultBlocks.length < 5) {
        let link = fbMatch[1];
        if (link.includes("uddg=")) {
          const uddgParam = link.split("uddg=")[1];
          if (uddgParam) link = decodeURIComponent(uddgParam.split("&")[0]);
        }
        const title = fbMatch[2].replace(/<[^>]*>/g, '').trim();
        const snippet = fbMatch[3].replace(/<[^>]*>/g, '').trim();
        if (title && link) {
          resultBlocks.push({ title, link, snippet });
        }
      }
    }

    if (resultBlocks.length === 0) {
      // Let's query DDG Instant Answer API as final fallback
      const apiResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
      if (apiResponse.ok) {
        const data = await apiResponse.json() as any;
        if (data.AbstractText) {
          resultBlocks.push({
            title: data.Heading || "Resumen de Referencia",
            link: data.AbstractURL || "https://duckduckgo.com",
            snippet: data.AbstractText
          });
        }
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          for (const topic of data.RelatedTopics.slice(0, 3)) {
            if (topic.Text && topic.FirstURL) {
              resultBlocks.push({
                title: topic.Text.split(" - ")[0] || "Tema Relacionado",
                link: topic.FirstURL,
                snippet: topic.Text
              });
            }
          }
        }
      }
    }
    
    return resultBlocks;
  } catch (error) {
    console.error("Error performing search:", error);
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY!,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }
    const results = await performWebSearch(query);
    res.json({ results });
  });

  // WebSocket for Live API
  wss.on("connection", async (clientWs) => {
    console.log("Client connected");
    
    // Default system instructions and tool configuration for Jarvis
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          clientWs.send(JSON.stringify(message));
        },
        onclose: () => clientWs.close(),
        onerror: (err) => console.error("Jarvis WebSocket Error:", err),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
        },
        systemInstruction: "You are J.A.R.V.I.S., the highly advanced AI assistant of Tony Stark. You are polite, highly intelligent, concise, slightly witty, and address the user appropriately (e.g. 'Sir' or 'Madam'). You are fully multilingual and can speak and understand all languages. You MUST always detect and respond in the EXACT same language that the user is using or asking a question in (e.g., if they speak in English, respond in English; if they speak in Spanish, respond in Spanish; if in French, French, and so on). Be succinct and professional. Don't add emojis because you are talking via voice.\n\n" +
          "VERY IMPORTANT: If the user asks you to explain a complex topic, or asks for a 3D visualization, you MUST use the 'displayHologram' tool to project a generated 3D simulation on the screen. Because you cannot generate real MP4 videos, you will act as if you are compiling a 3D holographic visualizer by generating custom, self-contained HTML/JS using Three.js via CDN (or SVG for 2D if explicitly better) to vividly illustrate the concept in 3D.\n\n" +
          "HIGH-FIDELITY REALISTIC 3D HOLOGRAMS: Rather than basic wireframes or disconnected vertices, generate true, solid, and highly detailed 3D versions of the requested object. Use complex shapes (combining multiple solid meshes, like spheres, cylinders, torus), multiple rich lights (point lights with emissive elements, directional lights to cast shadows, ambient lighting for depth), colorful gradients, reflective materials (e.g., THREE.MeshStandardMaterial with high roughness/metalness or emissiveIntensity), or procedural textures. The hologram must look realistic, incredibly polished, and complete.\n\n" +
          "MODIFICATIONS & TRANSFORMS IN-PLACE: If the user asks to modify, transform, add elements, or change features of a hologram that is already on screen, DO NOT open a separate hologram. Instead, you MUST use the 'modifyHologram' tool to update the existing hologram in-place with a transition. Always keep the experience completely fluid.\n\n" +
          "ENTRANCE ANIMATIONS: At the start of your Three.js script, implement a smooth materialization transition (e.g., scale meshes from 0 up to 1, or interpolate opacity from 0 to 1 over the first 60 frames) so that the hologram appears to materialize smoothly.\n\n" +
          "CAMERA AND VISION: The user has a camera that you can access using the 'toggleCamera' tool. If the user asks you to look at something, see their environment, or open the camera, call 'toggleCamera(true)'. Once the camera is on, you will receive real-time video frames.\n\n" +
          "GOOGLE SEARCH & DATA GATHERING: Before generating a complex 3D model with Three.js (such as a specific engine, car parts, solar system body, or futuristic gadgets), you are highly encouraged and should use the 'googleSearch' tool to compile real-world design blueprints, dimensions, mathematical equations, and visual style elements from search results. This complements your Gemini intelligence perfectly to build the highest quality visuals.\n\n" +
          "Whenever you use 'displayHologram' or 'modifyHologram', YOUR SPOKEN RESPONSE MUST BE EXTREMELY BRIEF (e.g. 'Proyectando la nueva configuración, señor.' o 'Transformando el modelo 3D en tiempo real...'). Do not speak the full explanation if you are showing the animation.",
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
                description: "Muestra una o varias visualizaciones holográficas animadas con código o SVG. Úsala cuando el usuario pida explicar un concepto complejo o proyectos 3D.",
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
                      description: "Código HTML completo (<html><body>...) que genere una simulación dinámica. Puedes y debes crear representaciones 3D espectaculares incluyendo Three.js (usando <script src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'></script>). Siempre haz que el canvas sea pantalla completa en window.innerWidth/Height. IMPRESCINDIBLE: El body debe tener background: transparent; color: white; margin: 0; overflow: hidden;."
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
                description: "Modifica un holograma existente de manera fluida y con una animación de transición/transformación in-place. Úsala cuando el usuario pida cambiar, agregar detalles, cambiar colores o transformar la simulación en pantalla del holograma previo sin abrir uno nuevo.",
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
              },
              {
                name: "listGoogleDriveFiles",
                description: "Busca y lista archivos o carpetas en Google Drive. Úsala para encontrar IDs de presentaciones de Slides, imágenes u otros documentos a petición del usuario.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: {
                      type: Type.STRING,
                      description: "Consulta de búsqueda para Drive."
                    }
                  },
                  required: ["query"]
                }
              },
              {
                name: "readGoogleSlidePresentation",
                description: "Lee los detalles de una presentación de Google Slides basada en su ID.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    presentationId: {
                      type: Type.STRING,
                      description: "El ID de la presentación en Drive."
                    }
                  },
                  required: ["presentationId"]
                }
              },
              {
                name: "modifyGoogleSlidePresentation",
                description: "Envía un conjunto de actualizaciones en lote (batch updates) a una presentación de Slides.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    presentationId: {
                      type: Type.STRING,
                      description: "El ID de la presentación."
                    },
                    requests: {
                      type: Type.STRING,
                      description: "Un array JSON estricto en string con los requests para el batchUpdate."
                    }
                  },
                  required: ["presentationId", "requests"]
                }
              }
            ]
          }
        ]
      },
    });

    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.audio) {
        session.sendRealtimeInput({
          audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
        });
      }
      if (msg.toolResponse) {
        session.sendToolResponse(msg.toolResponse);
      }
    });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
