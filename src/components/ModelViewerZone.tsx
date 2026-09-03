'use client';

import { useState } from 'react';
import { Upload, Box, FileCode, ChevronDown, ChevronUp } from 'lucide-react';
import { LegoViewer } from './LegoViewer';
import { LDRAW_PARTS_LIBRARY_PATH, LDRAW_SAMPLES } from '@/lib/ldraw-config';

export function ModelViewerZone() {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string | undefined>();
  const [partNum, setPartNum] = useState('3001');

  const openUrl = (url: string, title?: string) => {
    setViewerTitle(title);
    setFileUrl(url);
  };

  const openPart = () => {
    const id = partNum.trim().replace(/\.dat$/i, '');
    if (!id) return;
    openUrl(`${LDRAW_PARTS_LIBRARY_PATH}parts/${id}.dat`, `Part ${id}`);
  };

  const processFile = (file: File) => {
    if (file.name.endsWith('.ldr') || file.name.endsWith('.mpd') || file.name.endsWith('.dat')) {
      const url = URL.createObjectURL(file);
      openUrl(url, file.name);
    } else {
      alert('Please upload a valid LDraw file (.ldr, .mpd, .dat)');
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
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 font-medium transition-colors"
        >
          <Box className="w-3.5 h-3.5" />
          {open ? 'Hide 3D model viewer' : 'Open 3D model viewer'}
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {open && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {LDRAW_SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openUrl(s.url, s.label)}
                  className="text-xs px-2.5 py-1.5 rounded-md border border-gray-300 bg-white text-gray-900 font-medium hover:bg-orange-50 hover:border-orange-300"
                >
                  Try: {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-700 font-medium" htmlFor="ldraw-part">
                Explore part #
              </label>
              <input
                id="ldraw-part"
                value={partNum}
                onChange={(e) => setPartNum(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openPart();
                }}
                placeholder="3001"
                className="w-28 text-xs px-2 py-1.5 rounded-md border border-gray-300 bg-white text-gray-900"
              />
              <button
                type="button"
                onClick={openPart}
                className="text-xs px-2.5 py-1.5 rounded-md border border-gray-300 bg-white text-gray-900 font-medium hover:bg-gray-50"
              >
                Load part
              </button>
              <span className="text-[11px] text-gray-500">from LDraw library (CDN)</span>
            </div>

            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative overflow-hidden group
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
                  <Upload className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium">Or drop an LDraw file</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Packed .mpd preferred · loose .ldr uses the online parts library
                  </p>
                </div>
              </div>

              <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <FileCode className="w-24 h-24" />
              </div>
            </div>
          </div>
        )}
      </div>

      {fileUrl && (
        <LegoViewer
          fileUrl={fileUrl}
          title={viewerTitle}
          onClose={() => {
            if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl);
            setFileUrl(null);
            setViewerTitle(undefined);
          }}
        />
      )}
    </>
  );
}
