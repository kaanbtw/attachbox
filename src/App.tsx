import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GalleryPage } from "@/pages/GalleryPage";
import { UploadModal } from "@/pages/UploadPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { getAllMedia } from "@/lib/tauri-api";
import type { MediaItem } from "@/types";
import { listen } from "@tauri-apps/api/event";

export type OpenMode = "hotkey" | "tray";
type View = "gallery" | "settings";

const PAGE_VARIANTS = {
  initial: { opacity: 0, x: 20, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -20, filter: "blur(4px)" },
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>("gallery");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [openMode, setOpenMode] = useState<OpenMode>("tray");
  const [showUpload, setShowUpload] = useState(false);

  const fetchMedia = useCallback(async () => {
    try {
      const items = await getAllMedia();
      setMediaItems(items);
    } catch (err) {
      console.error("Failed to fetch media:", err);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  useEffect(() => {
    const unlisten = listen<string>("window-opened", (event) => {
      const source = event.payload as OpenMode;
      setOpenMode(source);
      if (source === "hotkey") {
        setCurrentView("gallery");
        setShowUpload(false);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlistenMedia = listen("media-changed", () => fetchMedia());
    const unlistenStorage = listen("storage-changed", () => fetchMedia());
    return () => {
      unlistenMedia.then((fn) => fn());
      unlistenStorage.then((fn) => fn());
    };
  }, [fetchMedia]);

  const isSettings = currentView === "settings";

  return (
    <div className="flex flex-col h-screen bg-surface-0 overflow-hidden rounded-xl border border-border">
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full"
          >
            {isSettings ? (
              <SettingsPage onBack={() => setCurrentView("gallery")} />
            ) : (
              <GalleryPage
                items={mediaItems}
                openMode={openMode}
                onRefresh={fetchMedia}
                onOpenUpload={() => setShowUpload(true)}
                onOpenSettings={() => setCurrentView("settings")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Upload modal overlay */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onRefresh={fetchMedia}
        onForceOpen={() => setShowUpload(true)}
      />
    </div>
  );
}
