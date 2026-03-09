import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/types";

export type FitMode = "landscape" | "portrait" | "square";
export type RenderMode = "adaptive" | "fill";

interface AdaptiveMediaProps {
  assetUrl: string;
  mediaType: MediaType;
  mediaName: string;
  retryKey: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onLoaded: () => void;
  onError: () => void;
  onFitModeChange?: (fitMode: FitMode) => void;
  backgroundClassName?: string;
  foregroundWrapperClassName?: string;
  foregroundClassName?: string;
  renderMode?: RenderMode;
}

function getFitMode(width: number, height: number): FitMode {
  if (!width || !height) return "square";

  const ratio = width / height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.85) return "portrait";
  return "square";
}

export function AdaptiveMedia({
  assetUrl,
  mediaType,
  mediaName,
  retryKey,
  videoRef,
  onLoaded,
  onError,
  onFitModeChange,
  backgroundClassName,
  foregroundWrapperClassName,
  foregroundClassName,
  renderMode = "adaptive",
}: AdaptiveMediaProps) {
  const [fitMode, setFitMode] = useState<FitMode>("square");

  useEffect(() => {
    setFitMode("square");
    onFitModeChange?.("square");
  }, [assetUrl, onFitModeChange, retryKey]);

  const updateFitMode = useCallback(
    (nextFitMode: FitMode) => {
      setFitMode(nextFitMode);
      onFitModeChange?.(nextFitMode);
    },
    [onFitModeChange],
  );

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      updateFitMode(
        getFitMode(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight),
      );
      onLoaded();
    },
    [onLoaded, updateFitMode],
  );

  const handleVideoLoaded = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      updateFitMode(
        getFitMode(event.currentTarget.videoWidth, event.currentTarget.videoHeight),
      );
      onLoaded();
    },
    [onLoaded, updateFitMode],
  );

  const mediaFitClassName =
    renderMode === "fill"
      ? "h-full w-full object-cover"
      : fitMode === "landscape"
        ? "w-full h-auto max-h-full"
        : fitMode === "portrait"
          ? "h-full w-auto max-w-full"
          : "h-full w-full object-contain";

  if (mediaType === "video") {
    return (
      <>
        <video
          key={`bg-${retryKey}`}
          src={assetUrl}
          muted
          loop
          playsInline
          preload="metadata"
          className={cn(
            "absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-55",
            backgroundClassName,
          )}
          aria-hidden="true"
        />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            foregroundWrapperClassName,
          )}
        >
          <video
            key={`fg-${retryKey}`}
            ref={videoRef}
            src={assetUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={cn(mediaFitClassName, foregroundClassName)}
            onLoadedData={handleVideoLoaded}
            onError={onError}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <img
        key={`bg-${retryKey}`}
        src={assetUrl}
        alt=""
        className={cn(
          "absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-55",
          backgroundClassName,
        )}
        aria-hidden="true"
        draggable={false}
      />
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          foregroundWrapperClassName,
        )}
      >
        <img
          key={`fg-${retryKey}`}
          src={assetUrl}
          alt={mediaName}
          loading="eager"
          className={cn(mediaFitClassName, foregroundClassName)}
          onLoad={handleImageLoad}
          onError={onError}
          draggable={false}
        />
      </div>
    </>
  );
}
