import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { ImageOff, Search } from "lucide-react";
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
}

const COLUMN_COUNT = 3;
const ROW_GAP = 10;
const ITEM_SIZE = 142;

export function GalleryPage({ items, openMode, onRefresh }: GalleryPageProps) {
  const autoPaste = openMode === "hotkey";
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const resolveUrls = async () => {
      const newUrls: Record<string, string> = {};
      for (const item of filteredItems) {
        if (!assetUrls[item.id]) {
          const absPath = await getMediaAssetPath(item.filename);
          newUrls[item.id] = getAssetUrl(absPath);
        }
      }
      if (Object.keys(newUrls).length > 0) {
        setAssetUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };
    resolveUrls();
  }, [filteredItems, assetUrls]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement === searchRef.current) {
        if (e.key === "Escape") {
          searchRef.current?.blur();
          setSearchQuery("");
        }
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const total = filteredItems.length;
      if (total === 0) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, total - 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + COLUMN_COUNT, total - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - COLUMN_COUNT, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex]);
          }
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleDelete(filteredItems[selectedIndex].id);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredItems, selectedIndex, handleSelect, handleDelete]);

  useEffect(() => {
    const rowIndex = Math.floor(selectedIndex / COLUMN_COUNT);
    virtualizer.scrollToIndex(rowIndex, { align: "auto" });
  }, [selectedIndex, virtualizer]);

  useEffect(() => {
    setSelectedIndex((prev) =>
      Math.min(prev, Math.max(0, filteredItems.length - 1)),
    );
  }, [filteredItems.length]);

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full gap-5 p-10"
      >
        <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center">
          <ImageOff className="w-7 h-7 text-fg-faint" />
        </div>
        <div className="text-center space-y-1.5">
          <h2 className="text-sm font-semibold text-fg-secondary">
            No media yet
          </h2>
          <p className="text-xs text-fg-muted max-w-52 leading-relaxed">
            Go to the Upload tab to add images, GIFs, and videos to your board.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 py-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search media...  type "/"'
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-lg bg-surface-2 border border-border text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent/60 transition-colors"
          />
        </div>
      </div>

      {/* Grid */}
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
                    {Array.from({ length: COLUMN_COUNT }).map((_, colIndex) => {
                      const itemIndex = rowStartIndex + colIndex;
                      const item = filteredItems[itemIndex];
                      if (!item) return <div key={colIndex} />;
                      return (
                        <MediaCard
                          key={item.id}
                          item={item}
                          assetUrl={assetUrls[item.id] || ""}
                          isSelected={selectedIndex === itemIndex}
                          openMode={openMode}
                          onSelect={() => {
                            setSelectedIndex(itemIndex);
                            handleSelect(item);
                          }}
                          onDelete={() => handleDelete(item.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-border text-[10px] text-fg-faint flex items-center justify-between shrink-0">
        <span>
          {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
          {searchQuery && ` (filtered)`}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-surface-3 text-fg-faint font-mono text-[9px]">
              ←→↑↓
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-surface-3 text-fg-faint font-mono text-[9px]">
              ↵
            </kbd>
            {openMode === "hotkey" ? "paste" : "copy"}
          </span>
        </span>
      </div>
    </div>
  );
}
