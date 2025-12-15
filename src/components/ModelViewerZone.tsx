'use client';

import { useState } from 'react';
import { useGarageStore } from '@/store/garage';
import { Upload, Box, FileCode } from 'lucide-react';
import { LegoViewer } from './LegoViewer';

export function ModelViewerZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const processFile = (file: File) => {
    if (file.name.endsWith('.ldr') || file.name.endsWith('.mpd') || file.name.endsWith('.dat')) {
        const url = URL.createObjectURL(file);
        setFileUrl(url);
    } else {
        alert("Please upload a valid LDraw file (.ldr, .mpd)");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <>
        <div
            className={`mt-6 border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative overflow-hidden group
                ${isDragging ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('ldr-upload')?.click()}
        >
            <input
                type="file"
                id="ldr-upload"
                className="hidden"
                accept=".ldr,.mpd,.dat"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />

            <div className="flex flex-col items-center gap-3 relative z-10">
                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                    <Box className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                    <p className="text-gray-900 font-medium">Visualize 3D Model</p>
                    <p className="text-sm text-gray-500 mt-1">Drop an .ldr or .mpd file here to view in 3D</p>
                </div>
            </div>

            {/* Decoration */}
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <FileCode className="w-24 h-24" />
            </div>
        </div>

        {fileUrl && (
            <LegoViewer fileUrl={fileUrl} onClose={() => setFileUrl(null)} />
        )}
    </>
  );
}
