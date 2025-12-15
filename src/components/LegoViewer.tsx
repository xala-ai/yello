'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Center, Environment } from '@react-three/drei';
import { Suspense, useState } from 'react';
import { useLDraw } from '@/hooks/useLDraw';
import { Loader2, Maximize2, X } from 'lucide-react';

interface LegoModelProps {
  url: string;
}

function LegoModel({ url }: LegoModelProps) {
  const group = useLDraw(url);

  // Auto-rotate slightly to look cool
  return (
    <group rotation={[Math.PI, 0, 0]}>
       {/* LDraw models are often upside down or Y-up different */}
       <primitive object={group} />
    </group>
  );
}

export function LegoViewer({ fileUrl, onClose }: { fileUrl: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl h-[80vh] bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl border border-[#333] flex flex-col relative">

        {/* Header */}
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
             <div>
                 <h3 className="text-white font-bold text-xl tracking-tight font-sans">3D Build View</h3>
                 <p className="text-gray-400 text-sm">Interactive Instruction Mode</p>
             </div>
             <button
                onClick={onClose}
                className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
             >
                 <X className="w-6 h-6" />
             </button>
        </div>

        {/* 3D Canvas */}
        <div className="flex-1 w-full h-full bg-[#1a1a1a]">
           <Suspense fallback={
               <div className="w-full h-full flex flex-col items-center justify-center text-white gap-4">
                   <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
                   <p className="text-gray-400">Parsing LDraw Geometry...</p>
               </div>
           }>
              <Canvas shadows camera={{ position: [50, 50, 50], fov: 45 }}>
                  <color attach="background" args={['#1a1a1a']} />
                  <fog attach="fog" args={['#1a1a1a', 50, 300]} />

                  <Stage environment="city" intensity={0.6} contactShadow={{ opacity: 0.5, blur: 2 }}>
                      <Center>
                          <LegoModel url={fileUrl} />
                      </Center>
                  </Stage>

                  <OrbitControls autoRotate autoRotateSpeed={0.5} makeDefault />
              </Canvas>
           </Suspense>
        </div>

        {/* Controls / Footer */}
        <div className="bg-[#222] p-4 border-t border-[#333] flex items-center justify-between">
             <div className="flex gap-4">
                 <div className="px-3 py-1 rounded bg-orange-500/10 text-orange-500 text-xs font-bold uppercase tracking-wider border border-orange-500/20">
                     WebGL Powered
                 </div>
                 <p className="text-gray-500 text-xs">
                     Drag to rotate • Scroll to zoom
                 </p>
             </div>
             <div className="text-gray-500 text-xs">
                 LDraw Engine v1.0
             </div>
        </div>
      </div>
    </div>
  );
}
