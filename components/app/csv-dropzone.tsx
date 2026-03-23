"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CSVDropzoneProps {
  onFileContent: (content: string, fileName: string) => void;
  disabled?: boolean;
}

export function CSVDropzone({ onFileContent, disabled }: CSVDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(csv|tsv|txt)$/i)) {
        return;
      }
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === "string") {
          onFileContent(text, file.name);
        }
      };
      reader.readAsText(file);
    },
    [onFileContent],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, disabled],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  function clear() {
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition",
        dragging
          ? "border-brand bg-brand/5"
          : "border-white/10 bg-surface-raised hover:border-brand/30 hover:bg-surface-hover",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {fileName ? (
        <div className="flex items-center gap-3">
          <FileUp className="h-6 w-6 text-brand" />
          <span className="text-sm font-semibold text-white">{fileName}</span>
          <button
            type="button"
            onClick={clear}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <FileUp className="h-8 w-8 text-brand" />
          <div>
            <p className="text-sm font-semibold text-white">
              Drop a CSV file here or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-brand underline underline-offset-2"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Supports .csv, .tsv, and .txt with comma, semicolon, or tab delimiters
            </p>
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        onChange={onInputChange}
        className="hidden"
      />
    </div>
  );
}
