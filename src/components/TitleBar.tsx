import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Images, CloudUpload, Settings } from "lucide-react";
import type { PageRoute } from "@/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface TitleBarProps {
  currentPage: PageRoute;
  onNavigate: (page: PageRoute) => void;
}

const NAV_ITEMS: { id: PageRoute; label: string; icon: React.ReactNode }[] = [
  { id: "gallery", label: "Gallery", icon: <Images className="w-4 h-4" /> },
  { id: "upload", label: "Upload", icon: <CloudUpload className="w-4 h-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
];

export function TitleBar({ currentPage, onNavigate }: TitleBarProps) {
  const appWindow = getCurrentWindow();

  return (
    <header className="shrink-0 select-none">
      {/* Draggable top bar */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between h-11 px-4 bg-surface-0"
      >
        <div className="flex items-center gap-2.5" data-tauri-drag-region>
          <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center shadow-[0_0_12px_oklch(0.60_0.25_280/0.3)]">
            <span className="text-[9px] font-bold text-white leading-none">
              A
            </span>
          </div>
          <span className="text-xs font-semibold tracking-[0.12em] uppercase text-fg-muted">
            AttachBox
          </span>
        </div>

        <button
          onClick={() => appWindow.hide()}
          className="group w-7 h-7 rounded-lg flex items-center justify-center text-fg-faint hover:bg-danger/15 hover:text-danger transition-all duration-200"
          aria-label="Close to tray"
        >
          <X className="w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110" />
        </button>
      </div>

      {/* Tab navigation */}
      <nav className="flex items-center gap-1 px-3 pb-2.5">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors duration-200 cursor-pointer",
                isActive ? "text-fg" : "text-fg-faint hover:text-fg-muted",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 rounded-lg bg-surface-2 border border-border"
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 28,
                  }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="h-px bg-border" />
    </header>
  );
}
