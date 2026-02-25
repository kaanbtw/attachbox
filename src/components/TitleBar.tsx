import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, ArrowLeft } from "lucide-react";

interface TitleBarProps {
  showBack?: boolean;
  onBack?: () => void;
}

export function TitleBar({ showBack, onBack }: TitleBarProps) {
  const appWindow = getCurrentWindow();

  return (
    <header className="shrink-0 select-none">
      <div
        data-tauri-drag-region
        className="flex items-center justify-between h-10 px-3 bg-surface-0"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          {showBack ? (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-all duration-150 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : (
            <div data-tauri-drag-region className="w-4" />
          )}
        </div>

        <button
          onClick={() => appWindow.hide()}
          className="group w-7 h-7 rounded-lg flex items-center justify-center text-fg-faint hover:bg-danger/15 hover:text-danger transition-all duration-200 cursor-pointer"
          aria-label="Close to tray"
        >
          <X className="w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110" />
        </button>
      </div>
    </header>
  );
}
