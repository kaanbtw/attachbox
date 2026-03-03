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
}

export function DiscoverPage({ onBack, onRefresh }: DiscoverPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<EmoteResult[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<UploadResult[]>([]);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Auto-search 7TV GraphQL API
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      setHasMore(true);
      fetchEmotes(searchQuery, 1);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isSearching) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchEmotes(searchQuery, nextPage);
        }
      },
      { threshold: 0.1 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isSearching, page, searchQuery]);

  const fetchEmotes = async (currentQuery: string, currentPage: number) => {
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
          id: `${item.id}-${currentPage}`, // Avoid duplicates on pagination overlaps
          name: item.name,
          previewUrl: `${hostUrl}/4x.webp`,
          downloadUrl: `${hostUrl}/4x.gif`,
        };
      });

      setResults((prev) =>
        currentPage === 1 ? parsedResults : [...prev, ...parsedResults],
      );
      setHasMore(parsedResults.length === 30);
    } catch (err) {
      console.error("Search failed:", err);
      setStatusMessages([{ type: "error", message: "Failed to search 7TV." }]);
    } finally {
      setIsSearching(false);
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
      <div
        data-tauri-drag-region
        className="flex items-center justify-between h-12 px-4 shrink-0 border-b border-border/50 pt-2"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="flex items-center gap-2 pointer-events-none">
          <Globe className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-semibold text-fg">Discover 7TV</span>
        </div>
        <button
          onClick={() => getCurrentWindow().hide()}
          className="group w-8 h-8 -mr-2 rounded-lg flex items-center justify-center text-fg-faint hover:bg-danger/15 hover:text-danger transition-all duration-200 cursor-pointer"
          aria-label="Close to tray"
        >
          <X className="w-4 h-4 transition-transform duration-150 group-hover:scale-110" />
        </button>
      </div>

      {/* Search Input Section */}
      <div className="p-4 py-3 shrink-0 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for emotes..."
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
              <p className="text-xs text-fg-secondary">No emotes found.</p>
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
