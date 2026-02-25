import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileImage,
  X,
} from "lucide-react";
import { importFiles } from "@/lib/tauri-api";
import { cn } from "@/lib/utils";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface UploadPageProps {
  onRefresh: () => void;
}

interface UploadResult {
  type: "success" | "error";
  message: string;
}

export function UploadPage({ onRefresh }: UploadPageProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const processFiles = useCallback(
    async (filePaths: string[]) => {
      if (filePaths.length === 0) return;
      setIsUploading(true);
      setResults([]);

      try {
        const imported = await importFiles(filePaths);
        const newResults: UploadResult[] = [];

        if (imported.length > 0) {
          newResults.push({
            type: "success",
            message: `${imported.length} file${imported.length !== 1 ? "s" : ""} imported successfully`,
          });
        }

        const skipped = filePaths.length - imported.length;
        if (skipped > 0) {
          newResults.push({
            type: "error",
            message: `${skipped} file${skipped !== 1 ? "s" : ""} skipped (unsupported format)`,
          });
        }

        setResults(newResults);
        onRefresh();
      } catch (err) {
        setResults([{ type: "error", message: `Import failed: ${err}` }]);
      } finally {
        setIsUploading(false);
      }
    },
    [onRefresh],
  );

  // Listen for Tauri's native drag-drop events (provides actual file paths)
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    const setupListener = async () => {
      const unlisten = await appWindow.onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setIsDragOver(true);
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          processFiles(event.payload.paths);
        }
      });

      return unlisten;
    };

    const unlistenPromise = setupListener();

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [processFiles]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full p-4 gap-4"
    >
      {/* Drop zone */}
      <div
        className={cn(
          "flex-1 flex flex-col items-center justify-center gap-5",
          "rounded-2xl border-2 border-dashed transition-all duration-300",
          isDragOver
            ? "border-accent bg-accent/5 scale-[1.01]"
            : "border-border bg-surface-1 hover:border-border-hover hover:bg-surface-2/40",
        )}
      >
        <motion.div
          animate={{
            scale: isDragOver ? 1.15 : 1,
            rotate: isDragOver ? 6 : 0,
          }}
          transition={{ type: "spring", bounce: 0.4 }}
          className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center",
            isDragOver ? "bg-accent/20" : "bg-surface-3",
          )}
        >
          {isUploading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
              <Upload className="w-7 h-7 text-accent" />
            </motion.div>
          ) : isDragOver ? (
            <FileImage className="w-7 h-7 text-accent" />
          ) : (
            <Upload className="w-7 h-7 text-fg-faint" />
          )}
        </motion.div>

        <div className="text-center space-y-1.5">
          <h2 className="text-sm font-semibold text-fg-secondary">
            {isDragOver ? "Drop files here" : "Drag & Drop Media"}
          </h2>
          <p className="text-xs text-fg-muted max-w-60 leading-relaxed">
            Drop images, GIFs, or videos here. Files will be copied to
            AttachBox's local storage.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
          {["PNG", "JPG", "GIF", "WEBP", "MP4", "WEBM"].map((format) => (
            <span
              key={format}
              className="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-surface-3 text-fg-faint border border-border"
            >
              .{format.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-fg-secondary">
                Results
              </span>
              <button
                onClick={() => setResults([])}
                className="p-1 rounded-md text-fg-faint hover:text-fg-muted hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {results.map((result, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs",
                  result.type === "success"
                    ? "bg-success/10 text-success border border-success/20"
                    : "bg-danger/10 text-danger border border-danger/20",
                )}
              >
                {result.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                {result.message}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
