'use client';

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import { ChevronLeft, ChevronRight, Printer, X } from 'lucide-react';
import type { PlacedBrick } from '@/lib/planner';

const COLOR_HEX: Record<string, string> = {
  Black: '#1b1b1b', White: '#f4f4f4', Red: '#c91a09', Blue: '#0055bf',
  Yellow: '#f2cd37', Green: '#237841', Orange: '#fe8a18', Brown: '#583927',
  'Dark Bluish Gray': '#6d6e6c', 'Light Bluish Gray': '#a0a5a9', Tan: '#e4cd9e',
  Lime: '#bbe90b', Pink: '#fc97ac', Purple: '#81007b',
};

function brickColor(name: string) {
  return COLOR_HEX[name] || '#c0c0c0';
}

function BrickMesh({ b, dimmed }: { b: PlacedBrick; dimmed?: boolean }) {
  // Approximate stud units → scene units
  const sx = 1, sy = 1.2, sz = 1;
  return (
    <mesh position={[b.x * sx, b.y * sy, b.z * sz]} rotation={[0, (b.rot * Math.PI) / 180, 0]}>
      <boxGeometry args={[sx * 0.95, sy * 0.9, sz * 0.95]} />
      <meshStandardMaterial
        color={brickColor(b.colorName)}
        transparent={dimmed}
        opacity={dimmed ? 0.25 : 1}
        roughness={0.45}
      />
      {!dimmed && <Edges threshold={15} color="#111" />}
    </mesh>
  );
}

export function InstructionViewer({
  name,
  steps,
  onClose,
}: {
  name: string;
  steps: PlacedBrick[];
  onClose: () => void;
}) {
  const maxStep = useMemo(() => Math.max(1, ...steps.map((s) => s.step)), [steps]);
  const [step, setStep] = useState(1);
  const visible = steps.filter((s) => s.step <= step);
  const current = steps.filter((s) => s.step === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-5xl h-[85vh] bg-[#111] rounded-2xl overflow-hidden border border-[#333] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]">
          <div>
            <h3 className="text-white font-bold">{name}</h3>
            <p className="text-gray-400 text-xs">
              Step {step} / {maxStep}
              {current[0] ? ` — ${current.map((c) => c.description).join('; ')}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="p-2 text-gray-300 hover:text-white"
              title="Print"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-gray-300 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0">
          <div className="md:col-span-2 bg-[#1a1a1a]">
            <Canvas camera={{ position: [8, 8, 8], fov: 45 }}>
              <ambientLight intensity={0.7} />
              <directionalLight position={[10, 15, 8]} intensity={1.1} />
              {visible.map((b, i) => (
                <BrickMesh key={`${b.step}-${i}`} b={b} dimmed={b.step < step} />
              ))}
              <OrbitControls makeDefault />
              <gridHelper args={[20, 20, '#333', '#222']} />
            </Canvas>
          </div>
          <div className="border-l border-[#333] p-3 overflow-y-auto text-xs text-gray-300 space-y-1">
            {Array.from({ length: maxStep }, (_, i) => i + 1).map((n) => {
              const bits = steps.filter((s) => s.step === n);
              return (
                <button
                  key={n}
                  onClick={() => setStep(n)}
                  className={`w-full text-left px-2 py-1.5 rounded ${
                    n === step ? 'bg-yellow-500/20 text-yellow-300' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="font-bold mr-2">{n}.</span>
                  {bits.map((b) => b.description).join(' · ') || '—'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-[#333]">
          <button
            disabled={step <= 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="flex items-center gap-1 px-3 py-2 rounded bg-white/10 text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <input
            type="range"
            min={1}
            max={maxStep}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className="flex-1 mx-4 accent-yellow-500"
          />
          <button
            disabled={step >= maxStep}
            onClick={() => setStep((s) => Math.min(maxStep, s + 1))}
            className="flex items-center gap-1 px-3 py-2 rounded bg-yellow-500 text-black font-bold disabled:opacity-30"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
