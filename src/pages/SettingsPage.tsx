import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Keyboard,
  FolderOpen,
  ClipboardPaste,
  Save,
  CheckCircle2,
  Info,
} from "lucide-react";
import { getSettings, updateSettings, getStoragePath } from "@/lib/tauri-api";
import type { AppSettings } from "@/types";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storagePath, setStoragePath] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isRecordingKey, setIsRecordingKey] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const [s, path] = await Promise.all([getSettings(), getStoragePath()]);
      setSettings(s);
      setStoragePath(path);
    };
    loadSettings();
  }, []);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    try {
      await updateSettings(settings);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  }, [settings]);

  const handleKeyCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRecordingKey || !settings) return;
      e.preventDefault();
      const key = e.key === " " ? "Space" : e.key;
      setSettings({ ...settings, shortcut_key: key });
      setIsRecordingKey(false);
    },
    [isRecordingKey, settings],
  );

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col h-full"
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Shortcut */}
        <SettingSection
          icon={<Keyboard className="w-4 h-4" />}
          title="Global Shortcut"
          description="Key to summon AttachBox from anywhere"
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRecordingKey(true)}
              onKeyDown={handleKeyCapture}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-mono font-medium border transition-all cursor-pointer",
                isRecordingKey
                  ? "bg-accent/10 border-accent text-accent animate-pulse"
                  : "bg-surface-3 border-border text-fg hover:border-border-hover",
              )}
            >
              {isRecordingKey ? "Press a key..." : settings.shortcut_key}
            </button>
            {isRecordingKey && (
              <button
                onClick={() => setIsRecordingKey(false)}
                className="text-[10px] text-fg-faint hover:text-fg-muted cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </SettingSection>

        {/* Storage path */}
        <SettingSection
          icon={<FolderOpen className="w-4 h-4" />}
          title="Storage Location"
          description="Where media files are physically stored"
        >
          <code className="block px-3 py-2 rounded-lg bg-surface-2 text-[10px] font-mono text-fg-muted border border-border truncate max-w-48">
            {storagePath}
          </code>
        </SettingSection>

        {/* Auto paste */}
        <SettingSection
          icon={<ClipboardPaste className="w-4 h-4" />}
          title="Auto-Paste"
          description="Simulate Ctrl+V after selecting media"
        >
          <button
            onClick={() =>
              setSettings({
                ...settings,
                auto_paste_enabled: !settings.auto_paste_enabled,
              })
            }
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors duration-300 cursor-pointer",
              settings.auto_paste_enabled ? "bg-accent" : "bg-surface-4",
            )}
          >
            <motion.div
              animate={{ x: settings.auto_paste_enabled ? 22 : 3 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
            />
          </button>
        </SettingSection>

        {/* Info */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-surface-1 border border-border">
          <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="text-[11px] text-fg-muted leading-relaxed space-y-2">
            <p className="font-medium text-fg-secondary">Keyboard shortcuts</p>
            <div className="space-y-1">
              {[
                ["←→↑↓", "Navigate gallery"],
                ["Enter", "Select & paste"],
                ["/", "Focus search"],
                ["Delete", "Remove selected"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-3 text-fg-faint font-mono text-[10px] min-w-8 text-center">
                    {key}
                  </kbd>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <button
          onClick={handleSave}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer",
            isSaved
              ? "bg-success/15 text-success border border-success/25"
              : "bg-accent hover:bg-accent-hover text-white",
          )}
        >
          {isSaved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function SettingSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-1 border border-border">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center text-fg-muted shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-fg">{title}</h3>
          <p className="text-[11px] text-fg-muted mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
