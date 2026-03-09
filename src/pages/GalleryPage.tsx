import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ClipboardCopy,
  Filter,
  Globe,
  ImageOff,
  Images,
  Loader2,
  MonitorPlay,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AdaptiveMedia } from "@/components/AdaptiveMedia";
import { MediaCard } from "@/components/MediaCard";
import type { LibraryItem, MediaItem, MediaType, RemoteLibraryItem } from "@/types";
import type { OpenMode } from "@/App";
import {
  deleteMedia,
  getAssetUrl,
  getMediaAssetPath,
  pasteText,
  selectAndPaste,
} from "@/lib/tauri-api";
import {
  addRemoteLibraryItem,
  getRemoteLibraryItems,
  removeRemoteLibraryItem,
} from "@/lib/remote-library";
import { cn } from "@/lib/utils";

interface GalleryPageProps {
  items: MediaItem[];
  openMode: OpenMode;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onOpenSettings: () => void;
}

interface StatusMessage {
  type: "success" | "error";
  message: string;
}

interface EmoteResult {
  id: string;
  name: string;
  previewUrl: string;
  downloadUrl: string;
  source: "7tv" | "tenor";
  mediaType: MediaType;
}

type HubMode = "discover" | "library";

const COLUMN_COUNT = 3;
const ROW_GAP = 10;
const ITEM_SIZE = 142;

function isRemoteLibraryItem(item: LibraryItem): item is RemoteLibraryItem {
  return "kind" in item && item.kind === "remote";
}

function getLibraryItemName(item: LibraryItem) {
  return isRemoteLibraryItem(item) ? item.name : item.original_name;
}

function getRemoteItemId(result: EmoteResult) {
  return `${result.source}:${result.downloadUrl}`;
}

function DiscoverResultCard({
  emote,
  index,
  openMode,
  alreadyAdded,
  savingId,
  onSave,
  onSelect,
}: {
  emote: EmoteResult;
  index: number;
  openMode: OpenMode;
  alreadyAdded: boolean;
  savingId: string | null;
  onSave: (item: EmoteResult) => void;
  onSelect: (item: EmoteResult) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const hoverLabel = openMode === "hotkey" ? "Click to paste" : "Click to copy";
  const successLabel = openMode === "hotkey" ? "Pasted!" : "Copied!";

  const handleClick = useCallback(() => {
    setJustCopied(true);
    onSelect(emote);
    setTimeout(() => setJustCopied(false), 1200);
  }, [emote, onSelect]);

  const handleSaveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onSave(emote);
    },
    [emote, onSave],
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative aspect-square rounded-xl bg-surface-2 border border-border overflow-hidden flex items-center justify-center cursor-pointer"
    >
      <AdaptiveMedia
        assetUrl={emote.previewUrl}
        mediaType={emote.mediaType}
        mediaName={emote.name}
        retryKey={0}
        onLoaded={() => {}}
        onError={() => {}}
        foregroundWrapperClassName="relative z-[1]"
        renderMode={emote.source === "7tv" && emote.mediaType === "image" ? "fill" : "adaptive"}
      />
      <div className="absolute inset-0 bg-linear-to-b from-black/10 via-transparent to-black/10" />

      <AnimatePresence>
        {justCopied && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute inset-0 bg-accent/80 backdrop-blur-sm flex flex-col items-center justify-center gap-1.5 z-20"
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
              {successLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!justCopied && (
        <motion.div
          initial={false}
          animate={{ opacity: isHovered ? 1 : 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5 pointer-events-none z-10"
        >
          <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <ClipboardCopy className="w-4 h-4 text-white" />
          </div>
          <span className="text-[10px] font-medium text-white/90 tracking-wide">
            {hoverLabel}
          </span>
        </motion.div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-linear-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <span className="text-[10px] font-semibold text-white truncate w-full block text-center drop-shadow-md">
          {emote.name}
        </span>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button
          onClick={handleSaveClick}
          disabled={savingId !== null || alreadyAdded}
          className={cn(
            "w-7 h-7 rounded-lg backdrop-blur-md border shadow-sm flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed",
            alreadyAdded
              ? "bg-success/20 text-success border-success/30 opacity-100"
              : "bg-surface-0/60 text-fg hover:bg-accent hover:text-white border-border disabled:opacity-50",
          )}
        >
          {savingId === emote.id ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
              <Loader2 className="w-4 h-4" />
            </motion.div>
          ) : alreadyAdded ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </motion.div>
  );
}

export function GalleryPage({
  items,
  openMode,
  onRefresh,
  onOpenUpload,
  onOpenSettings,
}: GalleryPageProps) {
  const autoPaste = openMode === "hotkey";
  const [activeMode, setActiveMode] = useState<HubMode>("discover");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [remoteItems, setRemoteItems] = useState<RemoteLibraryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<EmoteResult[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<StatusMessage[]>([]);
  const [page, setPage] = useState(1);
  const [tenorNext, setTenorNext] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({
    show7TV: true,
    showTenor: true,
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const libraryParentRef = useRef<HTMLDivElement>(null);
  const discoverParentRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const libraryScrollTopRef = useRef(0);
  const discoverScrollTopRef = useRef(0);
  const lastDiscoverRequestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    getRemoteLibraryItems()
      .then(setRemoteItems)
      .catch((error) => {
        console.error("Failed to load remote library items:", error);
      });
  }, []);

  const libraryItems = useMemo<LibraryItem[]>(() => {
    return [...remoteItems, ...items].sort(
      (left, right) => right.created_at - left.created_at,
    );
  }, [items, remoteItems]);

  const filteredItems = useMemo(() => {
    if (!libraryQuery.trim()) return libraryItems;
    const query = libraryQuery.toLowerCase();
    return libraryItems.filter((item) =>
      getLibraryItemName(item).toLowerCase().includes(query),
    );
  }, [libraryItems, libraryQuery]);

  const remoteUrlSet = useMemo(
    () => new Set(remoteItems.map((item) => item.source_url)),
    [remoteItems],
  );

  const discoverRequestKey = useMemo(
    () => JSON.stringify({ query: discoverQuery.trim(), filters }),
    [discoverQuery, filters],
  );

  const rowCount = Math.ceil(filteredItems.length / COLUMN_COUNT);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => libraryParentRef.current,
    estimateSize: () => ITEM_SIZE + ROW_GAP,
    overscan: 3,
  });

  useEffect(() => {
    let cancelled = false;

    const resolveUrls = async () => {
      const localItems = filteredItems.filter(
        (item): item is MediaItem => !isRemoteLibraryItem(item),
      );

      const results = await Promise.allSettled(
        localItems.map(async (item) => {
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

  const fetchEmotesData = useCallback(
    async (currentQuery: string, currentPage: number): Promise<EmoteResult[]> => {
      const query = `
        query SearchEmotes($query: String!, $page: Int!, $sort: Sort, $filter: EmoteSearchFilter) {
          emotes(query: $query, page: $page, limit: 30, sort: $sort, filter: $filter) {
            items {
              id
              name
              animated
              host {
                url
              }
            }
          }
        }
      `;

      try {
        const isTrending = !currentQuery.trim();
        const variables: Record<string, unknown> = {
          query: currentQuery.trim(),
          page: currentPage,
        };

        if (isTrending) {
          variables.sort = { value: "popularity", order: "DESCENDING" };
          variables.filter = {
            category: "TRENDING_MONTH",
            exact_match: false,
          };
        }

        const response = await fetch("https://7tv.io/v3/gql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables }),
        });

        const data = await response.json();
        const emotes = data?.data?.emotes?.items || [];

        return emotes.map((item: any) => {
          let hostUrl = item.host.url;
          if (hostUrl.startsWith("//")) {
            hostUrl = `https:${hostUrl}`;
          }

          return {
            id: `${item.id}-7tv-${currentPage}`,
            name: item.name,
            previewUrl: `${hostUrl}/4x.webp`,
            downloadUrl: `${hostUrl}/4x.${item.animated ? "gif" : "webp"}`,
            source: "7tv" as const,
            mediaType: item.animated ? "gif" : "image",
          };
        });
      } catch (error) {
        console.error("7TV fetch failed:", error);
        return [];
      }
    },
    [],
  );

  const fetchTenorData = useCallback(
    async (
      currentQuery: string,
      currentNext: string,
    ): Promise<{ items: EmoteResult[]; next: string }> => {
      try {
        const q = currentQuery.trim();
        let url = "";
        if (!q) {
          url = "https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=30";
          if (currentNext) url += `&pos=${currentNext}`;
        } else {
          const params = new URLSearchParams({
            q,
            key: "LIVDSRZULELA",
            limit: "30",
          });
          if (currentNext) params.append("pos", currentNext);
          url = `https://g.tenor.com/v1/search?${params.toString()}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        const gifs = data.results || [];

        return {
          items: gifs.map((item: any) => ({
            id: `${item.id}-tenor-${currentNext}`,
            name: item.content_description || "Tenor GIF",
            previewUrl: item.media[0]?.tinygif?.url || item.media[0]?.gif?.url,
            downloadUrl:
              item.media[0]?.mediumgif?.url || item.media[0]?.gif?.url,
            source: "tenor" as const,
            mediaType: "gif" as const,
          })),
          next: data.next || "",
        };
      } catch (error) {
        console.error("Tenor fetch failed:", error);
        return { items: [], next: currentNext };
      }
    },
    [],
  );

  const fetchCombined = useCallback(
    async (
      currentQuery: string,
      current7TVPage: number,
      currentTenorNext: string,
    ) => {
      setIsSearching(true);
      setStatusMessages([]);

      let new7TVResults: EmoteResult[] = [];
      let newTenorResults: EmoteResult[] = [];
      let nextTenorCursor = currentTenorNext;

      try {
        const fetchPromises: Promise<void>[] = [];

        if (filters.show7TV) {
          fetchPromises.push(
            fetchEmotesData(currentQuery, current7TVPage).then((items) => {
              new7TVResults = items;
            }),
          );
        }

        if (filters.showTenor) {
          fetchPromises.push(
            fetchTenorData(currentQuery, currentTenorNext).then(
              ({ items, next }) => {
                newTenorResults = items;
                nextTenorCursor = next;
              },
            ),
          );
        }

        await Promise.allSettled(fetchPromises);

        const combined: EmoteResult[] = [];
        const maxLength = Math.max(new7TVResults.length, newTenorResults.length);
        for (let index = 0; index < maxLength; index += 1) {
          if (index < new7TVResults.length) combined.push(new7TVResults[index]);
          if (index < newTenorResults.length) combined.push(newTenorResults[index]);
        }

        setResults((prev) =>
          current7TVPage === 1 && currentTenorNext === ""
            ? combined
            : [...prev, ...combined],
        );
        setTenorNext(nextTenorCursor);

        const hasMore7TV = new7TVResults.length === 30;
        const hasMoreTenor =
          newTenorResults.length === 30 &&
          nextTenorCursor !== "" &&
          nextTenorCursor !== "0";
        setHasMore(hasMore7TV || hasMoreTenor);
        lastDiscoverRequestKeyRef.current = discoverRequestKey;
      } catch (error) {
        console.error("Combined search failed:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [discoverRequestKey, fetchEmotesData, fetchTenorData, filters],
  );

  useEffect(() => {
    if (activeMode !== "discover") return;
    if (lastDiscoverRequestKeyRef.current === discoverRequestKey) return;

    const debounce = setTimeout(() => {
      setPage(1);
      setTenorNext("");
      setResults([]);
      setHasMore(true);
      fetchCombined(discoverQuery, 1, "");
    }, 500);

    return () => clearTimeout(debounce);
  }, [activeMode, discoverQuery, discoverRequestKey, fetchCombined]);

  useEffect(() => {
    if (activeMode !== "discover") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isSearching) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchCombined(discoverQuery, nextPage, tenorNext);
        }
      },
      { threshold: 0.1 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [activeMode, discoverQuery, fetchCombined, hasMore, isSearching, page, tenorNext]);

  useEffect(() => {
    const libraryElement = libraryParentRef.current;
    const discoverElement = discoverParentRef.current;

    if (activeMode === "library") {
      if (discoverElement) {
        discoverScrollTopRef.current = discoverElement.scrollTop;
      }
      if (libraryElement) {
        libraryElement.scrollTop = libraryScrollTopRef.current;
      }
      return;
    }

    if (libraryElement) {
      libraryScrollTopRef.current = libraryElement.scrollTop;
    }
    if (discoverElement) {
      discoverElement.scrollTop = discoverScrollTopRef.current;
    }
  }, [activeMode]);

  const handleLibraryScroll = useCallback(() => {
    if (libraryParentRef.current) {
      libraryScrollTopRef.current = libraryParentRef.current.scrollTop;
    }
  }, []);

  const handleDiscoverScroll = useCallback(() => {
    if (discoverParentRef.current) {
      discoverScrollTopRef.current = discoverParentRef.current.scrollTop;
    }
  }, []);

  const handleSelectLocal = useCallback(
    async (item: MediaItem) => {
      try {
        await selectAndPaste(item.id, autoPaste);
      } catch (error) {
        console.error("Paste failed:", error);
      }
    },
    [autoPaste],
  );

  const handleSelectDiscover = useCallback(
    async (item: EmoteResult) => {
      try {
        await pasteText(item.downloadUrl, autoPaste);
      } catch (error) {
        console.error("Paste discover link failed:", error);
        setStatusMessages([
          {
            type: "error",
            message: autoPaste ? "Failed to paste link." : "Failed to copy link.",
          },
        ]);
      }
    },
    [autoPaste],
  );
  const handleSelectRemote = useCallback(async (item: RemoteLibraryItem) => {
    try {
      await navigator.clipboard.writeText(item.source_url);
    } catch (error) {
      console.error("Copy remote link failed:", error);
      setStatusMessages([{ type: "error", message: "Failed to copy link." }]);
    }
  }, []);

  const handleDelete = useCallback(
    async (item: LibraryItem) => {
      try {
        if (isRemoteLibraryItem(item)) {
          const nextItems = await removeRemoteLibraryItem(item.id);
          setRemoteItems(nextItems);
          setStatusMessages([{ type: "success", message: "Removed from library." }]);
          return;
        }

        await deleteMedia(item.id);
        onRefresh();
      } catch (error) {
        console.error("Delete failed:", error);
        setStatusMessages([{ type: "error", message: "Failed to remove item." }]);
      }
    },
    [onRefresh],
  );

  const handleSaveDiscoverItem = useCallback(
    async (item: EmoteResult) => {
      if (savingId) return;
      setSavingId(item.id);

      try {
        const result = await addRemoteLibraryItem({
          id: getRemoteItemId(item),
          kind: "remote",
          name: item.name,
          preview_url: item.previewUrl,
          source_url: item.downloadUrl,
          source: item.source,
          media_type: item.mediaType,
          created_at: Date.now(),
        });

        setRemoteItems(result.items);
        setStatusMessages([
          {
            type: "success",
            message: result.added ? "Added to library." : "Already in library.",
          },
        ]);
      } catch (error) {
        console.error("Save discover item failed:", error);
        setStatusMessages([{ type: "error", message: "Failed to add item to library." }]);
      } finally {
        setSavingId(null);
      }
    },
    [savingId],
  );

  const resultCount = activeMode === "discover" ? results.length : filteredItems.length;
  const searchValue = activeMode === "discover" ? discoverQuery : libraryQuery;
  const searchPlaceholder =
    activeMode === "discover"
      ? "Search emotes & GIFs..."
      : libraryItems.length === 0
        ? "No media to search"
        : "Search library...";

  return (
    <div className="flex flex-col h-full">
      <div
        data-tauri-drag-region
        className="px-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            type="text"
            value={searchValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (activeMode === "discover") {
                setDiscoverQuery(nextValue);
              } else {
                setLibraryQuery(nextValue);
              }
            }}
            disabled={activeMode === "library" && libraryItems.length === 0}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-9 py-2 text-xs rounded-xl bg-surface-2 border border-border text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            autoComplete="off"
            autoFocus={activeMode === "discover"}
          />
          {activeMode === "discover" && isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-faint">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Loader2 className="w-4 h-4" />
              </motion.div>
            </div>
          )}
        </div>

        {activeMode === "discover" && (
          <div className="relative">
            <button
              onClick={() => setIsFilterOpen((open) => !open)}
              className={cn(
                "group/utility w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-surface-2 text-fg-faint shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 cursor-pointer",
                isFilterOpen || !filters.show7TV || !filters.showTenor
                  ? "bg-accent text-white border-accent shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                  : "hover:border-border-hover hover:bg-surface-3 hover:text-fg",
              )}
              title="Filter Sources"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-40 bg-surface-0 border border-border/60 rounded-xl shadow-lg shadow-black/20 p-2 z-50 overflow-hidden"
                >
                  <div className="text-[10px] font-semibold text-fg-muted mb-1.5 px-2 uppercase tracking-wide">
                    Sources
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 p-2 hover:bg-surface-2 rounded-lg cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={filters.show7TV}
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            show7TV: event.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded-sm border-border text-accent accent-accent focus:ring-accent/30 focus:ring-offset-0 bg-surface-1 cursor-pointer"
                      />
                      <Globe className="w-3.5 h-3.5 text-fg-secondary" />
                      <span className="text-xs text-fg font-medium">7TV Emotes</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 hover:bg-surface-2 rounded-lg cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={filters.showTenor}
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            showTenor: event.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded-sm border-border text-accent accent-accent focus:ring-accent/30 focus:ring-offset-0 bg-surface-1 cursor-pointer"
                      />
                      <MonitorPlay className="w-3.5 h-3.5 text-fg-secondary" />
                      <span className="text-xs text-fg font-medium">Tenor GIFs</span>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <button
          onClick={() => getCurrentWindow().hide()}
          className="group/utility w-9 h-9 rounded-xl flex items-center justify-center text-fg-faint bg-surface-2 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:bg-surface-3 hover:text-fg hover:border-border-hover transition-all duration-200 cursor-pointer shrink-0"
          aria-label="Close to tray"
        >
          <X className="w-4 h-4 transition-transform duration-150 group-hover/utility:scale-110 group-hover/utility:text-danger" />
        </button>
      </div>

      {activeMode === "discover" ? (
        <div
          ref={discoverParentRef}
          onScroll={handleDiscoverScroll}
          className="flex-1 overflow-y-auto p-4 flex flex-col items-center"
        >
          {results.length > 0 ? (
            <div className="w-full grid grid-cols-3 gap-3">
              {results.map((emote, index) => (
                <DiscoverResultCard
                  key={emote.id}
                  emote={emote}
                  index={index}
                  openMode={openMode}
                  alreadyAdded={remoteUrlSet.has(emote.downloadUrl)}
                  savingId={savingId}
                  onSave={handleSaveDiscoverItem}
                  onSelect={handleSelectDiscover}
                />
              ))}
            </div>
          ) : (
            !isSearching && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                <Globe className="w-8 h-8 text-fg-faint mb-3" />
                <p className="text-xs text-fg-secondary">No items found.</p>
              </div>
            )
          )}

          {(hasMore || isSearching) && (
            <div ref={observerTarget} className="w-full flex justify-center py-6 pb-8">
              {isSearching && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Loader2 className="w-6 h-6 text-fg-faint" />
                </motion.div>
              )}
            </div>
          )}
        </div>
      ) : libraryItems.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col items-center justify-center gap-5 p-10"
        >
          <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center shadow-sm">
            <ImageOff className="w-7 h-7 text-fg-faint" />
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-sm font-semibold text-fg-secondary">Library is empty</h2>
            <p className="text-xs text-fg-muted max-w-56 leading-relaxed">
              Add local files or save items from Discover to keep them here.
            </p>
          </div>
        </motion.div>
      ) : (
        <div
          ref={libraryParentRef}
          onScroll={handleLibraryScroll}
          className="flex-1 overflow-y-auto px-4 pb-4"
        >
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
                        const assetUrl = isRemoteLibraryItem(item)
                          ? item.preview_url
                          : assetUrls[item.id] || "";
                        return (
                          <MediaCard
                            key={item.id}
                            item={item}
                            assetUrl={assetUrl}
                            openMode={openMode}
                            onSelect={() =>
                              isRemoteLibraryItem(item)
                                ? handleSelectRemote(item)
                                : handleSelectLocal(item)
                            }
                            onDelete={() => handleDelete(item)}
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
      )}

      <AnimatePresence>
        {statusMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-3 space-y-1.5 shrink-0"
          >
            {statusMessages.map((result, index) => (
              <motion.div
                key={`${result.message}-${index}`}
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
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 shrink-0" />
                )}
                {result.message}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 py-2 border-t border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveMode("discover")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer",
              activeMode === "discover"
                ? "bg-surface-2 text-fg"
                : "text-fg-muted hover:text-fg hover:bg-surface-2",
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            Discover
          </button>
          <button
            onClick={() => setActiveMode("library")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 cursor-pointer",
              activeMode === "library"
                ? "bg-surface-2 text-fg"
                : "text-fg-muted hover:text-fg hover:bg-surface-2",
            )}
          >
            <Images className="w-3.5 h-3.5" />
            Library
          </button>
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
        <div className="flex items-center gap-2 text-fg-faint">
          <span className="text-[10px]">
            {resultCount} item{resultCount !== 1 ? "s" : ""}
          </span>
          <div className="h-3.5 w-px bg-border" />
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
            aria-label="Open settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
