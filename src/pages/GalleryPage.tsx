import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { ImageOff, Search, Plus, Settings, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MediaCard } from "@/components/MediaCard";
import type { MediaItem } from "@/types";
import type { OpenMode } from "@/App";
import {
  selectAndPaste,
  deleteMedia,
  getMediaAssetPath,
  getAssetUrl,
} from "@/lib/tauri-api";

interface GalleryPageProps {
  items: MediaItem[];
  openMode: OpenMode;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onOpenSettings: () => void;
}

const COLUMN_COUNT = 3;
const ROW_GAP = 10;
const ITEM_SIZE = 142;

export function GalleryPage({
  items,
  openMode,
  onRefresh,
  onOpenUpload,
  onOpenSettings,
}: GalleryPageProps) {
  const autoPaste = openMode === "hotkey";
  const [searchQuery, setSearchQuery] = useState("");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const parentRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      item.original_name.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  const rowCount = Math.ceil(filteredItems.length / COLUMN_COUNT);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_SIZE + ROW_GAP,
    overscan: 3,
  });

  // Resolve asset URLs for visible items
  useEffect(() => {
    let cancelled = false;

    const resolveUrls = async () => {
      // Resolve all item URLs in parallel
      const results = await Promise.allSettled(
        filteredItems.map(async (item) => {
          const absPath = await getMediaAssetPath(item.filename);
          return { id: item.id, url: getAssetUrl(absPath) };
        }),
      );

      if (cancelled) return;

      const newUrls: Record<string, string> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          newUrls[result.value.id] = result.value.url;
        }
      }

      if (Object.keys(newUrls).length > 0) {
        setAssetUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };

    resolveUrls();

    return () => {
      cancelled = true;
    };
  }, [filteredItems]);

  const handleSelect = useCallback(
    async (item: MediaItem) => {
      try {
        await selectAndPaste(item.id, autoPaste);
      } catch (err) {
        console.error("Paste failed:", err);
      }
    },
    [autoPaste],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteMedia(id);
        onRefresh();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [onRefresh],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search & Action Bar */}
      <div
        data-tauri-drag-region
        className="px-4 pt-4 pb-3 shrink-0 flex items-center gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={items.length === 0}
            placeholder={
              items.length === 0 ? "No media to search" : "Search media..."
            }
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-surface-2 border border-border text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <button
          onClick={() => getCurrentWindow().hide()}
          className="group w-8 h-8 rounded-lg flex items-center justify-center text-fg-faint bg-surface-2 border border-border hover:bg-danger/15 hover:text-danger hover:border-danger/30 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="Close to tray"
        >
          <X className="w-4 h-4 transition-transform duration-150 group-hover:scale-110" />
        </button>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col items-center justify-center gap-5 p-10"
        >
          <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center shadow-sm">
            <ImageOff className="w-7 h-7 text-fg-faint" />
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-sm font-semibold text-fg-secondary">
              No media yet
            </h2>
            <p className="text-xs text-fg-muted max-w-50 leading-relaxed">
              Click the <strong className="font-semibold text-fg">Add</strong>{" "}
              button below to import images, GIFs, and videos.
            </p>
          </div>
        </motion.div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto px-4 pb-4">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <AnimatePresence mode="popLayout">
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const rowStartIndex = virtualRow.index * COLUMN_COUNT;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className="grid gap-2.5"
                      style={{
                        gridTemplateColumns: `repeat(${COLUMN_COUNT}, 1fr)`,
                      }}
                    >
                      {Array.from({ length: COLUMN_COUNT }).map(
                        (_, colIndex) => {
                          const itemIndex = rowStartIndex + colIndex;
                          const item = filteredItems[itemIndex];
                          if (!item) return <div key={colIndex} />;
                          return (
                            <MediaCard
                              key={item.id}
                              item={item}
                              assetUrl={assetUrls[item.id] || ""}
                              openMode={openMode}
                              onSelect={() => handleSelect(item)}
                              onDelete={() => handleDelete(item.id)}
                            />
                          );
                        },
                      )}
                    </div>
                  </div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="text-[10px] text-fg-faint">
          {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
