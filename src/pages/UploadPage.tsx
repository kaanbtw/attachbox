import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileImage,
  X,
  Link as LinkIcon,
  Download,
} from "lucide-react";
import { importFiles, importFromUrl } from "@/lib/tauri-api";
import { cn } from "@/lib/utils";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onForceOpen: () => void;
}

interface UploadResult {
  type: "success" | "error";
  message: string;
}

export function UploadModal({
  isOpen,
  onClose,
  onRefresh,
  onForceOpen,
}: UploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [urlInput, setUrlInput] = useState("");

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsUploading(true);
    setResults([]);

    try {
      await importFromUrl(urlInput.trim());
      setResults([
        { type: "success", message: "Successfully imported from URL" },
      ]);
      setUrlInput("");
      onRefresh();

      setTimeout(() => {
        onClose();
        setResults([]);
      }, 1200);
    } catch (err) {
      setResults([{ type: "error", message: `URL import failed: ${err}` }]);
    } finally {
      setIsUploading(false);
    }
  };

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
            message: `${imported.length} file${imported.length !== 1 ? "s" : ""} imported`,
          });
        }

        const skipped = filePaths.length - imported.length;
        if (skipped > 0) {
          newResults.push({
            type: "error",
            message: `${skipped} file${skipped !== 1 ? "s" : ""} skipped`,
          });
        }

        setResults(newResults);
        onRefresh();

        // Auto-close after success
        if (newResults.every((r) => r.type === "success")) {
          setTimeout(() => {
            onClose();
            setResults([]);
          }, 1200);
        }
      } catch (err) {
        setResults([{ type: "error", message: `Import failed: ${err}` }]);
      } finally {
        setIsUploading(false);
      }
    },
    [onRefresh, onClose],
  );

  // Listen for Tauri's native drag-drop events
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const setupListener = async () => {
      const unlisten = await appWindow.onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setIsDragOver(true);
          onForceOpen();
        } else if (event.payload.type === "leave") {
          setIsDragOver(false);
        } else if (event.payload.type === "drop") {
          setIsDragOver(false);
          onForceOpen();
          processFiles(event.payload.paths);
        }
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [processFiles, onForceOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        setResults([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => {
              onClose();
              setResults([]);
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-x-4 top-14 bottom-14 z-50 flex flex-col rounded-2xl bg-surface-0/95 backdrop-blur-xl border border-border shadow-[0_16px_64px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-semibold text-fg">Add Media</span>
              <button
                onClick={() => {
                  onClose();
                  setResults([]);
                }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-fg-faint hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Drop zone */}
            <div className="flex-1 p-4">
              <div
                className={cn(
                  "h-full flex flex-col items-center justify-center gap-4",
                  "rounded-xl border-2 border-dashed transition-all duration-300",
                  isDragOver
                    ? "border-accent bg-accent/5 scale-[1.01]"
                    : "border-border bg-surface-1/50 hover:border-border-hover",
                )}
              >
                <motion.div
                  animate={{
                    scale: isDragOver ? 1.15 : 1,
                    rotate: isDragOver ? 6 : 0,
                  }}
                  transition={{ type: "spring", bounce: 0.4 }}
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center",
                    isDragOver ? "bg-accent/20" : "bg-surface-3",
                  )}
                >
                  {isUploading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: "linear",
                      }}
                    >
                      <Upload className="w-6 h-6 text-accent" />
                    </motion.div>
                  ) : isDragOver ? (
                    <FileImage className="w-6 h-6 text-accent" />
                  ) : (
                    <Upload className="w-6 h-6 text-fg-faint" />
                  )}
                </motion.div>

                <div className="text-center space-y-1">
                  <h2 className="text-sm font-semibold text-fg-secondary">
                    {isDragOver ? "Drop files here" : "Drag & Drop Media"}
                  </h2>
                  <p className="text-[11px] text-fg-muted max-w-48 leading-relaxed">
                    Images, GIFs, or videos
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
                  {["PNG", "JPG", "GIF", "WEBP", "MP4"].map((format) => (
                    <span
                      key={format}
                      className="px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-surface-3 text-fg-faint border border-border"
                    >
                      .{format.toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* URL Input Divider */}
            <div className="relative flex items-center justify-center py-1 shrink-0 px-4">
              <div className="absolute inset-x-4 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface-0/95 px-3 text-fg-faint font-medium">
                  Or paste link
                </span>
              </div>
            </div>

            {/* URL Input Section */}
            <form onSubmit={handleUrlSubmit} className="p-4 pt-3 shrink-0">
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/image.png"
                    className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl bg-surface-2 border border-border text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all font-mono disabled:opacity-50"
                    disabled={isUploading}
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!urlInput.trim() || isUploading}
                  className="w-10 h-10 rounded-xl bg-surface-2 text-fg border border-border hover:bg-accent/15 hover:border-accent/40 hover:text-accent transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
                  aria-label="Upload from URL"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Results */}
            <AnimatePresence>
              {results.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pb-3 space-y-1.5"
                >
                  {results.map((result, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]",
                        result.type === "success"
                          ? "bg-success/10 text-success border border-success/20"
                          : "bg-danger/10 text-danger border border-danger/20",
                      )}
                    >
                      {result.type === "success" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {result.message}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
