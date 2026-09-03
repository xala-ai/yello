'use client';

/* eslint-disable react-hooks/immutability -- Three.js camera/controls are imperative objects. */

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
} from 'react';
import { Box3, type Group, type Object3D, Vector3 } from 'three';
import { useLDraw } from '@/hooks/useLDraw';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

function applyBuildingStep(root: Object3D, step: number) {
  root.traverse((c) => {
    if (c.userData.buildingStep != null) {
      c.visible = c.userData.buildingStep <= step;
    }
    if ((c as { isConditionalLine?: boolean }).isConditionalLine) {
      c.visible = false;
    }
  });
}

/** One-shot camera frame - avoids Bounds.observe (can thrash until WebGL context loss). */
function FrameModel({ object, tick }: { object: Object3D; tick: number }) {
  const { camera, controls } = useThree();
  useLayoutEffect(() => {
    try {
      const box = new Box3().setFromObject(object);
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
      const dist = Math.max(radius * 2.8, 40);
      camera.near = Math.max(0.1, radius / 100);
      camera.far = Math.max(5000, dist * 20);
      camera.position.set(center.x + dist * 0.9, center.y + dist * 0.55, center.z + dist * 0.9);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      const orbit = controls as unknown as { target: Vector3; update: () => void } | null;
      if (orbit?.target) {
        orbit.target.copy(center);
        orbit.update?.();
      }
    } catch {
      // ignore framing errors on partial trees
    }
  }, [object, tick, camera, controls]);
  return null;
}

function LegoModel({
  url,
  buildingStep,
  onReady,
}: {
  url: string;
  buildingStep: number;
  onReady: (numSteps: number) => void;
}) {
  const source = useLDraw(url);
  const group = useMemo(() => source.clone(true) as Group, [source]);

  useEffect(() => {
    const steps = Math.max(1, Number(source.userData.numBuildingSteps) || 1);
    onReady(steps);
  }, [source, onReady]);

  useEffect(() => {
    applyBuildingStep(group, buildingStep);
  }, [group, buildingStep]);

  return (
    <group rotation={[Math.PI, 0, 0]}>
      <primitive object={group} />
      <FrameModel object={group} tick={buildingStep} />
    </group>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[80, 120, 60]} intensity={1.1} />
      <directionalLight position={[-60, 40, -40]} intensity={0.35} />
    </>
  );
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'Failed to render LDraw model' };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message || 'Failed to render LDraw model');
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

export function LegoViewer({
  fileUrl,
  title,
  instructionSteps,
  onClose,
}: {
  fileUrl: string;
  title?: string;
  instructionSteps?: Array<{
    stepNum: number;
    partNum: string;
    colorName: string;
    description: string;
  }>;
  onClose: () => void;
}) {
  const [numSteps, setNumSteps] = useState(1);
  const [step, setStep] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const readyForUrl = useRef<string | null>(null);

  const onReady = useCallback(
    (steps: number) => {
      setModelReady(true);
      if (readyForUrl.current === fileUrl) {
        setNumSteps(steps);
        return;
      }
      readyForUrl.current = fileUrl;
      setNumSteps(steps);
      setStep(steps - 1);
    },
    [fileUrl],
  );

  const retry = () => {
    setLoadError(null);
    setModelReady(false);
    readyForUrl.current = null;
    setCanvasKey((k) => k + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl h-[80vh] bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl border border-[#333] flex flex-col relative">
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-30 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <div>
            <h3 className="text-white font-bold text-xl tracking-tight font-sans">
              {title ?? '3D Build View'}
            </h3>
            <p className="text-gray-300 text-sm">LDraw - drag to orbit - scroll to zoom</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 w-full h-full bg-[#1a1a1a] min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          {loadError ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white gap-3 p-6 text-center bg-[#1a1a1a]">
              <p className="text-orange-400 font-semibold">Couldn&apos;t load this LDraw file</p>
              <p className="text-sm text-gray-300 max-w-md">{loadError}</p>
              <button
                type="button"
                className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 text-sm hover:bg-white/20"
                onClick={retry}
              >
                Retry
              </button>
            </div>
          ) : null}

          {!loadError && !modelReady && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white gap-4 pointer-events-none bg-[#1a1a1a]">
              <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
              <p className="text-gray-300">Loading LDraw geometry...</p>
            </div>
          )}

          <ViewerErrorBoundary key={canvasKey} onError={(msg) => setLoadError(msg)}>
            <Canvas
              key={canvasKey}
              camera={{ position: [150, 100, 150], fov: 45, near: 0.1, far: 10000 }}
              onCreated={({ gl }) => {
                const el = gl.domElement;
                const onLost = (e: Event) => {
                  e.preventDefault();
                  setLoadError('WebGL context lost - close the viewer and try again.');
                };
                el.addEventListener('webglcontextlost', onLost, false);
              }}
            >
              <color attach="background" args={['#1a1a1a']} />
              <SceneLights />
              <Suspense fallback={null}>
                <LegoModel url={fileUrl} buildingStep={step} onReady={onReady} />
              </Suspense>
              <OrbitControls makeDefault />
            </Canvas>
          </ViewerErrorBoundary>
        </div>
        {instructionSteps && instructionSteps.length > 0 && (
          <aside className="hidden md:block w-72 border-l border-[#333] bg-[#181818] pt-20 p-3 overflow-y-auto">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
              Build steps
            </p>
            {Array.from({ length: numSteps }, (_, index) => {
              const stepNumber = index + 1;
              const parts = instructionSteps.filter((item) => item.stepNum === stepNumber);
              return (
                <button
                  key={stepNumber}
                  type="button"
                  onClick={() => setStep(index)}
                  className={`w-full text-left rounded-lg px-2 py-2 mb-1 text-xs ${
                    step === index
                      ? 'bg-yellow-400/20 text-yellow-200'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className="font-bold mr-1.5">{stepNumber}.</span>
                  {parts[0]?.description ?? 'Add the next layer'}
                  {parts.length > 0 && (
                    <span className="block text-[10px] text-gray-500 mt-1">
                      {parts.length} brick{parts.length === 1 ? '' : 's'}: {parts.map((part) => part.partNum).join(', ')}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>
        )}
        </div>

        <div className="bg-[#222] p-4 border-t border-[#333] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={step <= 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="p-2 rounded-lg bg-white/10 text-white disabled:opacity-30 hover:bg-white/20"
              aria-label="Previous step"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-[140px] px-2">
              <input
                type="range"
                min={0}
                max={Math.max(0, numSteps - 1)}
                value={Math.min(step, Math.max(0, numSteps - 1))}
                onChange={(e) => setStep(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
              <p className="text-center text-xs text-gray-300 mt-1">
                Step {step + 1} / {numSteps}
              </p>
            </div>
            <button
              type="button"
              disabled={step >= numSteps - 1}
              onClick={() => setStep((s) => Math.min(numSteps - 1, s + 1))}
              className="p-2 rounded-lg bg-white/10 text-white disabled:opacity-30 hover:bg-white/20"
              aria-label="Next step"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <p className="text-gray-400 text-xs self-center">
            Packed samples - parts CDN for unpacked files
          </p>
        </div>
      </div>
    </div>
  );
}
