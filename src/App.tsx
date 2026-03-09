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

      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onRefresh={fetchMedia}
        onForceOpen={() => setShowUpload(true)}
      />
    </div>
  );
}
