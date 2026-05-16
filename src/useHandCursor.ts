import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type ScreenLandmark = { x: number, y: number, z: number };

export type CursorState = {
  x: number;
  y: number;
  isPinching: boolean;
  isOpen: boolean;
  isVisible: boolean;
  id: number;
};

export function useHandCursor(
  videoElement: HTMLVideoElement | null, 
  isVideoEnabled: boolean,
  onSeparationGesture?: () => void
) {
  const [cursors, setCursors] = useState<CursorState[]>([]);
  const [skeletons, setSkeletons] = useState<ScreenLandmark[][]>([]);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  
  const activeTargets = useRef<(Element | null)[]>([null, null]);
  const hoverTargets = useRef<(Element | null)[]>([null, null]);
  const lastPinches = useRef<boolean[]>([false, false]);
  
  const zoomDistRef = useRef<number | null>(null);
  const angleRef = useRef<number | null>(null);
  
  const lastCloseTimeRef = useRef<number>(0);
  const lastFarTimeRef = useRef<number>(0);
  const separationGestureRef = useRef(onSeparationGesture);

  useEffect(() => {
    separationGestureRef.current = onSeparationGesture;
  }, [onSeparationGesture]);

  useEffect(() => {
    let active = true;
    const initModel = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      if (active) {
         handLandmarkerRef.current = handLandmarker;
      }
    };
    initModel();
    return () => { active = false; handLandmarkerRef.current?.close(); };
  }, []);

  useEffect(() => {
    if (!isVideoEnabled || !videoElement || !handLandmarkerRef.current) {
       setCursors([]);
       setSkeletons([]);
       hoverTargets.current.forEach((target, i) => {
          if (target) {
             target.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerId: i + 1 }));
             hoverTargets.current[i] = null;
          }
       });
       activeTargets.current.forEach((target, i) => {
          if (target && lastPinches.current[i]) {
             target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: i + 1 }));
             activeTargets.current[i] = null;
             lastPinches.current[i] = false;
          }
       });
       return;
    }

    let lastVideoTime = -1;

    const detect = () => {
      if (!videoElement || !handLandmarkerRef.current || videoElement.readyState < 2) {
         requestRef.current = requestAnimationFrame(detect);
         return;
      }

      if (videoElement.currentTime !== lastVideoTime) {
         lastVideoTime = videoElement.currentTime;
          const results = handLandmarkerRef.current.detectForVideo(videoElement, performance.now());
         if (results.landmarks && results.landmarks.length > 0) {
            
            const mappedHands = results.landmarks.map(hand => 
              hand.map(lm => ({
                 x: (1 - lm.x) * window.innerWidth,
                 y: lm.y * window.innerHeight,
                 z: lm.z * 100
              }))
            );
            setSkeletons(mappedHands);

            const newCursors: CursorState[] = [];
            let isZooming = false;
            let zoomCenter = { x: 0, y: 0 };
            let zoomDist = 0;
            let currentAngle = 0;

            const isFingerOpen = (tip: number, base: number, hand: ScreenLandmark[]) => {
              const MathHypot3D = (dx: number, dy: number, dz: number) => Math.sqrt(dx*dx + dy*dy + dz*dz);
              const distTip = MathHypot3D(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y, hand[tip].z - hand[0].z);
              const distBase = MathHypot3D(hand[base].x - hand[0].x, hand[base].y - hand[0].y, hand[base].z - hand[0].z);
              return distTip > distBase * 1.3;
            };

            mappedHands.forEach((hand, hIdx) => {
               if (hIdx > 1) return;

               const index = hand[8];
               const thumb = hand[4];
               const dist = Math.hypot(index.x - thumb.x, index.y - thumb.y);
               const isPinching = dist < 40;

               const openFingersCount = [
                 isFingerOpen(8, 5, hand),
                 isFingerOpen(12, 9, hand),
                 isFingerOpen(16, 13, hand),
                 isFingerOpen(20, 17, hand)
               ].filter(Boolean).length;
               const isOpenHand = openFingersCount >= 3 && !isPinching;

               newCursors.push({
                 x: index.x,
                 y: index.y,
                 isPinching,
                 isOpen: isOpenHand,
                 isVisible: true,
                 id: hIdx
               });
            });

            if (newCursors.length === 2) {
               if (newCursors[0].isPinching && newCursors[1].isPinching) {
                  isZooming = true;
                  zoomCenter = { x: (newCursors[0].x + newCursors[1].x) / 2, y: (newCursors[0].y + newCursors[1].y) / 2 };
                  zoomDist = Math.hypot(newCursors[0].x - newCursors[1].x, newCursors[0].y - newCursors[1].y);
                  currentAngle = Math.atan2(newCursors[1].y - newCursors[0].y, newCursors[1].x - newCursors[0].x) * (180 / Math.PI);
               }

               const now = performance.now();
               const palmDist = Math.hypot(mappedHands[0][0].x - mappedHands[1][0].x, mappedHands[0][0].y - mappedHands[1][0].y);
               
               if (palmDist < 200) {
                   lastCloseTimeRef.current = now;
               } else if (palmDist > 500) {
                   if (lastCloseTimeRef.current > 0 && (now - lastCloseTimeRef.current) < 500) {
                       if (now - lastFarTimeRef.current > 1000) {
                           if (separationGestureRef.current) separationGestureRef.current();
                           lastFarTimeRef.current = now;
                       }
                   }
               }
            }

            setCursors(newCursors);

            if (isZooming) {
               newCursors.forEach((c, idx) => {
                 if (lastPinches.current[idx] && activeTargets.current[idx]) {
                    activeTargets.current[idx]?.dispatchEvent(new PointerEvent('pointerup', { clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, pointerId: c.id + 1, isPrimary: idx === 0, pointerType: 'mouse', button: 0, buttons: 0 }));
                    activeTargets.current[idx] = null;
                    lastPinches.current[idx] = false;
                 }
               });

               const prevZoomDist = zoomDistRef.current ?? zoomDist;
               const deltaDist = prevZoomDist - zoomDist; 
               
               const prevAngle = angleRef.current ?? currentAngle;
               let deltaAngle = currentAngle - prevAngle;
               if (deltaAngle > 180) deltaAngle -= 360;
               if (deltaAngle < -180) deltaAngle += 360;
               
               if (Math.abs(deltaDist) > 5 || Math.abs(deltaAngle) > 2) { 
                  const el = document.elementFromPoint(zoomCenter.x, zoomCenter.y);
                  if (el) {
                     el.dispatchEvent(new WheelEvent('wheel', { 
                       clientX: zoomCenter.x, 
                       clientY: zoomCenter.y, 
                       deltaY: deltaDist * 2, 
                       deltaX: deltaAngle * -4, // scale the rotation delta
                       bubbles: true, 
                       cancelable: true 
                     }));
                  }
                  zoomDistRef.current = zoomDist;
                  angleRef.current = currentAngle;
               }

            } else {
               zoomDistRef.current = null;
               angleRef.current = null;

               newCursors.forEach((c, idx) => {
                  const el = document.elementFromPoint(c.x, c.y);

                  if (el !== hoverTargets.current[idx]) {
                     if (hoverTargets.current[idx]) {
                        hoverTargets.current[idx]?.dispatchEvent(new PointerEvent('pointerleave', { clientX: c.x, clientY: c.y, bubbles: true, pointerId: c.id + 1, isPrimary: idx===0, pointerType: 'mouse' }));
                     }
                     if (el) {
                        el.dispatchEvent(new PointerEvent('pointerenter', { clientX: c.x, clientY: c.y, bubbles: true, pointerId: c.id + 1, isPrimary: idx===0, pointerType: 'mouse' }));
                     }
                     hoverTargets.current[idx] = el;
                  }

                  const moveTarget = activeTargets.current[idx] || el;
                  if (moveTarget) {
                     moveTarget.dispatchEvent(new PointerEvent('pointermove', { 
                        clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, 
                        pointerId: c.id + 1, isPrimary: idx===0, pointerType: 'mouse', 
                        button: c.isPinching ? 0 : -1, buttons: c.isPinching ? 1 : 0 
                     }));
                  }

                  if (c.isPinching && !lastPinches.current[idx]) {
                     if (el) {
                        activeTargets.current[idx] = el;
                        el.dispatchEvent(new PointerEvent('pointerdown', { 
                           clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, 
                           pointerId: c.id + 1, isPrimary: idx===0, pointerType: 'mouse', button: 0, buttons: 1 
                        }));
                     }
                  } else if (!c.isPinching && lastPinches.current[idx]) {
                     if (activeTargets.current[idx]) {
                        activeTargets.current[idx]?.dispatchEvent(new PointerEvent('pointerup', { 
                           clientX: c.x, clientY: c.y, bubbles: true, cancelable: true, 
                           pointerId: c.id + 1, isPrimary: idx===0, pointerType: 'mouse', button: 0, buttons: 0 
                        }));
                        activeTargets.current[idx] = null;
                     }
                  }
                  lastPinches.current[idx] = c.isPinching;
               });
            }

         } else {
            setCursors([]);
            setSkeletons([]);
            hoverTargets.current.forEach((target, i) => {
               if (target) {
                  target.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerId: i + 1, isPrimary: i===0, pointerType: 'mouse' }));
                  hoverTargets.current[i] = null;
               }
            });
            activeTargets.current.forEach((target, i) => {
               if (target && lastPinches.current[i]) {
                  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: i + 1, isPrimary: i===0, pointerType: 'mouse', button: 0, buttons: 0 }));
                  activeTargets.current[i] = null;
                  lastPinches.current[i] = false;
               }
            });
         }
      }
      requestRef.current = requestAnimationFrame(detect);
    };

    requestRef.current = requestAnimationFrame(detect);
    return () => {
       if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isVideoEnabled, videoElement]);

  return { cursors, skeletons };
}
