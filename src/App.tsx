import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GalleryPage } from "@/pages/GalleryPage";
import { UploadModal } from "@/pages/UploadPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { scanMedia, storagePathExists } from "@/lib/tauri-api";
import type { MediaItem } from "@/types";
import { listen } from "@tauri-apps/api/event";

export type OpenMode = "hotkey" | "tray";
type View = "gallery" | "settings";

export default function App() {
  const [currentView, setCurrentView] = useState<View>("gallery");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [openMode, setOpenMode] = useState<OpenMode>("tray");
  const [showUpload, setShowUpload] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const previousStorageAvailableRef = useRef(true);

  const fetchMedia = useCallback(async () => {
    try {
      const items = await scanMedia();
      setMediaItems(items);
    } catch (err) {
      console.error("Failed to scan media:", err);
      setMediaItems([]);
    }
  }, []);

  const refreshStorageAvailability = useCallback(async () => {
    try {
      const exists = await storagePathExists();
      const wasAvailable = previousStorageAvailableRef.current;

      previousStorageAvailableRef.current = exists;
      setStorageAvailable(exists);

      if (!exists) {
        setMediaItems([]);
        setShowUpload(false);
        return;
      }

      if (!wasAvailable) {
        await fetchMedia();
      }
    } catch (err) {
      console.error("Failed to verify storage path:", err);
      previousStorageAvailableRef.current = false;
      setStorageAvailable(false);
      setMediaItems([]);
      setShowUpload(false);
    }
  }, [fetchMedia]);

  useEffect(() => {
    fetchMedia();
    refreshStorageAvailability();
  }, [fetchMedia, refreshStorageAvailability]);

  useEffect(() => {
    const unlisten = listen<string>("window-opened", (event) => {
      const source = event.payload as OpenMode;
      setOpenMode(source);
      refreshStorageAvailability();
      if (source === "hotkey") {
        setCurrentView("gallery");
        setShowUpload(false);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshStorageAvailability]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshStorageAvailability();
    }, 2000);

    const unlistenMedia = listen("media-changed", () => {
      fetchMedia();
      refreshStorageAvailability();
    });
    const unlistenStorage = listen("storage-changed", () => {
      fetchMedia();
      refreshStorageAvailability();
    });
    return () => {
      window.clearInterval(interval);
      unlistenMedia.then((fn) => fn());
      unlistenStorage.then((fn) => fn());
    };
  }, [fetchMedia, refreshStorageAvailability]);

  return (
    <div className="h-screen bg-transparent overflow-hidden rounded-[28px] [corner-shape:squircle_squircle_squircle_squircle]">
      <main className="h-full overflow-hidden rounded-[28px] bg-surface-0 border border-border/70 shadow-[0_20px_60px_rgba(0,0,0,0.38)] [corner-shape:squircle_squircle_squircle_squircle]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentView}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="h-full overflow-hidden rounded-[28px] [corner-shape:squircle_squircle_squircle_squircle]"
          >
            {currentView === "settings" ? (
              <SettingsPage
                storageUnavailable={!storageAvailable}
                onBack={() => setCurrentView("gallery")}
              />
            ) : (
              <GalleryPage
                items={mediaItems}
                openMode={openMode}
                storageUnavailable={!storageAvailable}
                onRefresh={fetchMedia}
                onOpenUpload={() => {
                  if (!storageAvailable) return;
                  setShowUpload(true);
                }}
                onOpenSettings={() => setCurrentView("settings")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onRefresh={fetchMedia}
        onForceOpen={() => {
          if (!storageAvailable) return;
          setShowUpload(true);
        }}
      />
    </div>
  );
}
