import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TitleBar } from "@/components/TitleBar";
import { GalleryPage } from "@/pages/GalleryPage";
import { UploadPage } from "@/pages/UploadPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { getAllMedia } from "@/lib/tauri-api";
import type { MediaItem, PageRoute } from "@/types";
import { listen } from "@tauri-apps/api/event";

export type OpenMode = "hotkey" | "tray";

const PAGE_VARIANTS = {
  initial: { opacity: 0, x: 20, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -20, filter: "blur(4px)" },
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageRoute>("gallery");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [openMode, setOpenMode] = useState<OpenMode>("tray");

  const fetchMedia = useCallback(async () => {
    try {
      const items = await getAllMedia();
      setMediaItems(items);
    } catch (err) {
      console.error("Failed to fetch media:", err);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // Listen for window open mode from Rust
  useEffect(() => {
    const unlisten = listen<string>("window-opened", (event) => {
      const source = event.payload as OpenMode;
      setOpenMode(source);
      if (source === "hotkey") {
        setCurrentPage("gallery");
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for file system changes (file watcher) and storage path changes
  useEffect(() => {
    const unlistenMedia = listen("media-changed", () => {
      fetchMedia();
    });

    const unlistenStorage = listen("storage-changed", () => {
      fetchMedia();
    });

    return () => {
      unlistenMedia.then((fn) => fn());
      unlistenStorage.then((fn) => fn());
    };
  }, [fetchMedia]);

  const renderPage = () => {
    switch (currentPage) {
      case "gallery":
        return (
          <GalleryPage
            items={mediaItems}
            openMode={openMode}
            onRefresh={fetchMedia}
          />
        );
      case "upload":
        return <UploadPage onRefresh={fetchMedia} />;
      case "settings":
        return <SettingsPage />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-surface-0 overflow-hidden rounded-xl border border-border">
      <TitleBar currentPage={currentPage} onNavigate={setCurrentPage} />

      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
