'use client';

import { useState } from 'react';
import { useGarageStore } from '@/store/garage';
import { Upload, FileSpreadsheet, Loader2, AlertCircle } from 'lucide-react';

export function ImportZone() {
  const { addSet } = useGarageStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setStatus(null);

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const setNums: string[] = [];

      // Detect format (Brickset vs BrickLink vs Rebrickable)
      // Brickset CSV usually has "SetNumber" column
      // Rebrickable CSV usually has "Part" or is just a list of sets?
      // Let's look for anything that looks like a set number "12345-1" or "12345"

      // Simple heuristic: Look for the first column that matches "Set Number" pattern

      for (const line of lines) {
          const columns = line.split(/,|;/).map(c => c.trim().replace(/['"]/g, '')); // Handle comma or semicolon, strip quotes

          // Skip header
          if (columns[0].toLowerCase().includes('set') && columns[0].toLowerCase().includes('number')) continue;
          if (columns[0].toLowerCase() === 'number') continue; // Brickset export header

          // Find potential set number
          const potentialSet = columns.find(c => /^\d{3,7}(-\d+)?$/.test(c));
          if (potentialSet) {
              let setNum = potentialSet;
              if (!setNum.includes('-')) setNum += '-1';
              setNums.push(setNum);
          }
      }

      if (setNums.length === 0) {
          throw new Error("No valid set numbers found in CSV.");
      }

      // Add sets sequentially (to handle rate limits better than Promise.all for massive lists)
      let added = 0;
      for (const setNum of setNums) {
          // Optional: Add a small delay or check if it exists first
          await addSet(setNum);
          added++;
      }

      setStatus({ type: 'success', message: `Successfully imported ${added} sets!` });

    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to parse file' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files?.[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
        className={`border border-dashed rounded-lg p-2 flex items-center justify-center transition-colors cursor-pointer h-full
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
        title="Import Brickset/BrickLink CSV"
    >
        <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".csv,.txt"
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />

        {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
            <div className="flex items-center gap-2 text-gray-500 hover:text-blue-600">
                <Upload className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">Import CSV</span>
            </div>
        )}

        {/* Minimal Toast for Status - would be better as a real toast context, but basic alert for now */}
        {status && (
            <div className="fixed bottom-4 right-4 z-50 bg-white shadow-lg rounded-lg p-4 border border-gray-200 animate-in slide-in-from-bottom-5">
                 <div className={`flex items-center gap-2 ${status.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                    {status.type === 'error' && <AlertCircle className="w-4 h-4" />}
                    {status.message}
                 </div>
            </div>
        )}
    </div>
  );
}
