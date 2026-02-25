import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Film,
  ImageIcon,
  ClipboardCopy,
  Check,
  ImageOff,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";
import type { OpenMode } from "@/App";

interface MediaCardProps {
  item: MediaItem;
  assetUrl: string;
  openMode: OpenMode;
  onSelect: () => void;
  onDelete: () => void;
}

type LoadState = "loading" | "loaded" | "error";

export function MediaCard({
  item,
  assetUrl,
  openMode,
  onSelect,
  onDelete,
}: MediaCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMediaLoaded = useCallback(() => {
    setLoadState("loaded");
  }, []);

  const handleMediaError = useCallback(() => {
    // Only set error if we actually had a URL to load
    if (assetUrl) {
      setLoadState("error");
    }
  }, [assetUrl]);

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadState("loading");
    setRetryKey((k) => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (item.media_type === "video" && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [item.media_type]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (item.media_type === "video" && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [item.media_type]);

  const handleClick = useCallback(() => {
    // Don't trigger paste if in error state
    if (loadState === "error") return;
    setJustCopied(true);
    onSelect();
    setTimeout(() => setJustCopied(false), 1200);
  }, [onSelect, loadState]);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirmDelete) {
        onDelete();
        setConfirmDelete(false);
      } else {
        setConfirmDelete(true);
        setTimeout(() => setConfirmDelete(false), 2000);
      }
    },
    [onDelete, confirmDelete],
  );

  const typeIcon =
    item.media_type === "video" ? (
      <Film className="w-3 h-3" />
    ) : (
      <ImageIcon className="w-3 h-3" />
    );

  // Don't render media element if URL is not ready yet
  const hasUrl = !!assetUrl;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative group aspect-square rounded-xl overflow-hidden cursor-pointer",
        "border border-transparent transition-all duration-200 hover:border-border-hover",
      )}
    >
      {/* Loading / Error / Media content */}
      {!hasUrl || loadState === "loading" ? (
        // Skeleton loader while URL is being resolved or media is loading
        <div className="w-full h-full bg-surface-2 animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-surface-0/40 flex items-center justify-center">
            {item.media_type === "video" ? (
              <Film className="w-4 h-4 text-fg-faint/50" />
            ) : (
              <ImageIcon className="w-4 h-4 text-fg-faint/50" />
            )}
          </div>
        </div>
      ) : null}

      {loadState === "error" ? (
        // Error fallback with retry
        <div className="w-full h-full bg-surface-2 flex flex-col items-center justify-center gap-2">
          <ImageOff className="w-6 h-6 text-fg-faint/60" />
          <span className="text-[9px] text-fg-faint/60 font-medium">
            Load failed
          </span>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-0/60 hover:bg-surface-0 text-[9px] text-fg-muted hover:text-fg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Retry
          </button>
        </div>
      ) : null}

      {/* Actual media — hidden until loaded, stays in DOM for loading */}
      {hasUrl && loadState !== "error" && (
        <>
          {item.media_type === "video" ? (
            <video
              key={`${item.id}-${retryKey}`}
              ref={videoRef}
              src={assetUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className={cn(
                "w-full h-full object-cover",
                loadState === "loading" && "absolute inset-0 opacity-0",
              )}
              onLoadedData={handleMediaLoaded}
              onError={handleMediaError}
            />
          ) : (
            <img
              key={`${item.id}-${retryKey}`}
              src={assetUrl}
              alt={item.original_name}
              loading="eager"
              className={cn(
                "w-full h-full object-cover",
                loadState === "loading" && "absolute inset-0 opacity-0",
              )}
              onLoad={handleMediaLoaded}
              onError={handleMediaError}
              draggable={false}
            />
          )}
        </>
      )}

      {/* Hover overlay with copy hint */}
      {loadState === "loaded" && (
        <motion.div
          initial={false}
          animate={{ opacity: isHovered && !justCopied ? 1 : 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5 pointer-events-none"
        >
          <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <ClipboardCopy className="w-4 h-4 text-white" />
          </div>
          <span className="text-[10px] font-medium text-white/90 tracking-wide">
            {openMode === "hotkey" ? "Click to paste" : "Click to copy"}
          </span>
        </motion.div>
      )}

      {/* Copied feedback */}
      <AnimatePresence>
        {justCopied && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute inset-0 bg-accent/80 backdrop-blur-sm flex flex-col items-center justify-center gap-1.5"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 20,
                delay: 0.05,
              }}
              className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
            >
              <Check className="w-5 h-5 text-white" strokeWidth={3} />
            </motion.div>
            <span className="text-[10px] font-semibold text-white tracking-wide">
              {openMode === "hotkey" ? "Pasted!" : "Copied!"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Type badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/50 text-[10px] text-white/70 backdrop-blur-sm">
        {typeIcon}
        <span className="uppercase font-medium tracking-wider">
          {item.media_type}
        </span>
      </div>

      {/* Delete button */}
      <motion.button
        initial={false}
        animate={{
          opacity: confirmDelete || isHovered ? 1 : 0,
          scale: confirmDelete || isHovered ? 1 : 0.8,
        }}
        onClick={handleDeleteClick}
        className={cn(
          "absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-colors cursor-pointer z-10",
          confirmDelete
            ? "bg-danger text-white animate-pulse"
            : "bg-danger/80 hover:bg-danger text-white",
        )}
        aria-label={
          confirmDelete ? "Confirm delete" : `Delete ${item.original_name}`
        }
      >
        {confirmDelete ? (
          <Check className="w-3 h-3" strokeWidth={3} />
        ) : (
          <Trash2 className="w-3 h-3" />
        )}
      </motion.button>

      {/* Filename on hover */}
      {loadState === "loaded" && (
        <motion.div
          initial={false}
          animate={{
            opacity: isHovered && !justCopied ? 1 : 0,
            y: isHovered ? 0 : 4,
          }}
          className="absolute bottom-0 left-0 right-0 p-2.5 pointer-events-none bg-linear-to-t from-black/60 to-transparent"
        >
          <p className="text-[10px] text-white/90 truncate font-medium">
            {item.original_name}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
