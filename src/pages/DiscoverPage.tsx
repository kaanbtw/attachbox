import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Search,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Plus,
  MonitorPlay,
  Filter,
} from "lucide-react";
import { importFiles, downloadFromUrl } from "@/lib/tauri-api";
import { cn } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface DiscoverPageProps {
  onBack: () => void;
  onRefresh: () => void;
}

interface UploadResult {
  type: "success" | "error";
  message: string;
}

interface EmoteResult {
  id: string;
  name: string;
  previewUrl: string;
  downloadUrl: string;
  source?: "7tv" | "tenor";
}

export function DiscoverPage({ onBack, onRefresh }: DiscoverPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<EmoteResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<UploadResult[]>([]);

  const [page, setPage] = useState(1);
  const [tenorNext, setTenorNext] = useState("");
  const [hasMore, setHasMore] = useState(true);

  const [filters, setFilters] = useState({
    show7TV: true,
    showTenor: true,
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Auto-search API
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      setTenorNext("");
      setResults([]);
      setHasMore(true);
      fetchCombined(searchQuery, 1, "");
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, filters]);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isSearching) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchCombined(searchQuery, nextPage, tenorNext);
        }
      },
      { threshold: 0.1 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isSearching, page, searchQuery, tenorNext, filters]);

  const fetchCombined = async (
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

      // Combine results: alternate one from each if possible, or just append together
      const combined: EmoteResult[] = [];
      const maxLength = Math.max(new7TVResults.length, newTenorResults.length);
      for (let i = 0; i < maxLength; i++) {
        if (i < new7TVResults.length) combined.push(new7TVResults[i]);
        if (i < newTenorResults.length) combined.push(newTenorResults[i]);
      }

      setResults((prev) =>
        current7TVPage === 1 && currentTenorNext === ""
          ? combined
          : [...prev, ...combined],
      );
      setTenorNext(nextTenorCursor);

      // We have more if either source returned a full page.
      const hasMore7TV = new7TVResults.length === 30;
      const hasMoreTenor =
        newTenorResults.length === 30 &&
        nextTenorCursor !== "" &&
        nextTenorCursor !== "0";
      setHasMore(hasMore7TV || hasMoreTenor);
    } catch (err) {
      console.error("Combined search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchEmotesData = async (
    currentQuery: string,
    currentPage: number,
  ): Promise<EmoteResult[]> => {
    setIsSearching(true);
    setStatusMessages([]);

    const query = `
      query SearchEmotes($query: String!, $page: Int!, $sort: Sort, $filter: EmoteSearchFilter) {
        emotes(query: $query, page: $page, limit: 30, sort: $sort, filter: $filter) {
          items {
            id
            name
            host {
              url
            }
          }
        }
      }
    `;

    try {
      const isTrending = !currentQuery.trim();
      const variables: any = { query: currentQuery.trim(), page: currentPage };

      if (isTrending) {
        variables.sort = { value: "popularity", order: "DESCENDING" };
        variables.filter = { category: "TRENDING_MONTH", exact_match: false };
      }

      const res = await fetch("https://7tv.io/v3/gql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      const data = await res.json();
      const items = data?.data?.emotes?.items || [];

      const parsedResults: EmoteResult[] = items.map((item: any) => {
        let hostUrl = item.host.url;
        if (hostUrl.startsWith("//")) {
          hostUrl = "https:" + hostUrl;
        }

        return {
          id: `${item.id}-7tv-${currentPage}`,
          name: item.name,
          previewUrl: `${hostUrl}/4x.webp`,
          downloadUrl: `${hostUrl}/4x.gif`,
          source: "7tv",
        };
      });

      return parsedResults;
    } catch (err) {
      console.error("7TV Fetch failed:", err);
      return [];
    }
  };

  const fetchTenorData = async (
    currentQuery: string,
    currentNext: string,
  ): Promise<{ items: EmoteResult[]; next: string }> => {
    try {
      const q = currentQuery.trim();
      let url = "";
      if (!q) {
        url = `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=30`;
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

      const res = await fetch(url);
      const data = await res.json();
      const items = data.results || [];

      const parsedResults: EmoteResult[] = items.map((item: any) => {
        return {
          id: `${item.id}-tenor-${currentNext}`,
          name: item.content_description || "Tenor GIF",
          previewUrl: item.media[0]?.tinygif?.url || item.media[0]?.gif?.url,
          downloadUrl: item.media[0]?.mediumgif?.url || item.media[0]?.gif?.url,
          source: "tenor",
        };
      });

      return { items: parsedResults, next: data.next || "" };
    } catch (err) {
      console.error("Tenor Fetch failed:", err);
      return { items: [], next: currentNext };
    }
  };

  const downloadEmote = async (emote: EmoteResult) => {
    if (downloadingId) return;
    setDownloadingId(emote.id);
    setStatusMessages([
      { type: "success", message: `Downloading ${emote.name}...` },
    ]);

    try {
      const tempPath = await downloadFromUrl(emote.downloadUrl);
      const imported = await importFiles([tempPath]);

      if (imported.length > 0) {
        setStatusMessages([
          { type: "success", message: `Added ${emote.name} to gallery!` },
        ]);
        onRefresh();

        setTimeout(() => {
          setStatusMessages([]);
        }, 2000);
      } else {
        setStatusMessages([
          { type: "error", message: "Failed to import emote." },
        ]);
      }
    } catch (err) {
      console.error("Download failed:", err);
      setStatusMessages([
        { type: "error", message: `Failed to download: ${err}` },
      ]);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full"
    >
      {/* Search & Action Bar */}
      <div
        data-tauri-drag-region
        className="px-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center gap-2"
      >
        <button
          onClick={onBack}
          className="group w-8 h-8 rounded-lg flex items-center justify-center text-fg-faint bg-surface-2 border border-border hover:bg-surface-3 hover:text-fg transition-all duration-200 cursor-pointer shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        </button>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emotes & GIFs..."
            className="w-full pl-9 pr-9 py-2 text-xs rounded-xl bg-surface-2 border border-border text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all disabled:opacity-50"
            disabled={downloadingId !== null}
            autoComplete="off"
            autoFocus
          />
          {isSearching && (
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

        {/* Filter Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-200",
              isFilterOpen || !filters.show7TV || !filters.showTenor
                ? "bg-accent text-white border-accent"
                : "bg-surface-2 border-border text-fg hover:border-border-hover hover:bg-surface-3",
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
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, show7TV: e.target.checked }))
                      }
                      className="w-3.5 h-3.5 rounded-sm border-border text-accent accent-accent focus:ring-accent/30 focus:ring-offset-0 bg-surface-1 cursor-pointer"
                    />
                    <Globe className="w-3.5 h-3.5 text-fg-secondary" />
                    <span className="text-xs text-fg font-medium">
                      7TV Emotes
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-2 hover:bg-surface-2 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filters.showTenor}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          showTenor: e.target.checked,
                        }))
                      }
                      className="w-3.5 h-3.5 rounded-sm border-border text-accent accent-accent focus:ring-accent/30 focus:ring-offset-0 bg-surface-1 cursor-pointer"
                    />
                    <MonitorPlay className="w-3.5 h-3.5 text-fg-secondary" />
                    <span className="text-xs text-fg font-medium">
                      Tenor GIFs
                    </span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Close Button */}
        <button
          onClick={() => getCurrentWindow().hide()}
          className="group w-8 h-8 rounded-lg flex items-center justify-center text-fg-faint bg-surface-2 border border-border hover:bg-danger/15 hover:text-danger hover:border-danger/30 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="Close to tray"
        >
          <X className="w-4 h-4 transition-transform duration-150 group-hover:scale-110" />
        </button>
      </div>

      {/* Results Grid */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
        {results.length > 0 ? (
          <div className="w-full grid grid-cols-3 gap-3">
            {results.map((emote, idx) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.02 }}
                key={emote.id}
                className="group relative aspect-square rounded-xl bg-surface-2 border border-border overflow-hidden flex items-center justify-center"
              >
                <img
                  src={emote.previewUrl}
                  alt={emote.name}
                  className="w-full h-full p-2.5 object-contain"
                  loading="lazy"
                />

                {/* Info Overlay (bottom) */}
                <div className="absolute inset-x-0 bottom-0 p-1.5 bg-linear-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-semibold text-white truncate w-full block text-center drop-shadow-md">
                    {emote.name}
                  </span>
                </div>

                {/* Source Icon Grid Indicator */}
                <div className="absolute top-2 left-2 opacity-50 p-1 bg-surface-2/40 rounded-md backdrop-blur-xs">
                  {emote.source === "7tv" ? (
                    <Globe className="w-3 h-3 text-fg-muted" />
                  ) : (
                    <MonitorPlay className="w-3 h-3 text-fg-muted" />
                  )}
                </div>

                {/* Add Button (top right) */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => downloadEmote(emote)}
                    disabled={downloadingId !== null}
                    className="w-7 h-7 rounded-lg bg-surface-0/60 backdrop-blur-md text-fg hover:bg-accent hover:text-white border border-border shadow-sm flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingId === emote.id ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 1,
                          ease: "linear",
                        }}
                      >
                        <Loader2 className="w-4 h-4" />
                      </motion.div>
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
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

        {/* Infinite Scroll Target */}
        {(hasMore || isSearching) && (
          <div
            ref={observerTarget}
            className="w-full flex justify-center py-6 pb-8"
          >
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

      {/* Status Messages */}
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
  );
}
