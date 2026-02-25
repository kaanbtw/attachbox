import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Keyboard,
  FolderOpen,
  ClipboardPaste,
  Save,
  CheckCircle2,
  ChevronDown,
  Check,
  ArrowLeft,
  X,
  Power,
} from "lucide-react";
import {
  getSettings,
  updateSettings,
  getStoragePath,
  updateShortcut,
  changeStoragePath,
} from "@/lib/tauri-api";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { AppSettings } from "@/types";
import { cn } from "@/lib/utils";

const KEY_GROUPS = [
  {
    label: "Navigation",
    keys: ["End", "Home", "Insert", "Delete", "PageUp", "PageDown"],
  },
  {
    label: "System",
    keys: ["Pause", "ScrollLock", "NumLock"],
  },
  {
    label: "Function",
    keys: [
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
    ],
  },
];

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storagePath, setStoragePath] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const [pendingStoragePath, setPendingStoragePath] = useState<string | null>(
    null,
  );
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const initialSettingsRef = useRef<{
    settings: AppSettings;
    storagePath: string;
    autostart: boolean;
  } | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const [s, path] = await Promise.all([getSettings(), getStoragePath()]);
      setSettings(s);
      setStoragePath(path);
      const autostartEnabled = await isEnabled().catch(() => false);
      setLaunchOnStartup(autostartEnabled);
      initialSettingsRef.current = {
        settings: { ...s },
        storagePath: path,
        autostart: autostartEnabled,
      };
    };
    loadSettings();
  }, []);

  const hasChanges = useMemo(() => {
    if (!settings || !initialSettingsRef.current) return false;
    const init = initialSettingsRef.current;
    return (
      settings.shortcut_key !== init.settings.shortcut_key ||
      settings.auto_paste_enabled !== init.settings.auto_paste_enabled ||
      launchOnStartup !== init.autostart ||
      (pendingStoragePath !== null && pendingStoragePath !== init.storagePath)
    );
  }, [settings, pendingStoragePath, launchOnStartup]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    try {
      setIsChangingFolder(!!pendingStoragePath);

      let settingsToSave = { ...settings };

      // If storage path changed, migrate files first
      if (pendingStoragePath && pendingStoragePath !== storagePath) {
        const newPath = await changeStoragePath(pendingStoragePath);
        setStoragePath(newPath);
        setPendingStoragePath(null);
        // Update the settings object with the new path before saving
        settingsToSave.storage_path = newPath;
        setSettings({ ...settings, storage_path: newPath });
      }

      await updateSettings(settingsToSave);
      await updateShortcut(settingsToSave.shortcut_key);

      // Apply autostart change
      if (
        initialSettingsRef.current &&
        launchOnStartup !== initialSettingsRef.current.autostart
      ) {
        if (launchOnStartup) {
          await enable();
        } else {
          await disable();
        }
      }

      // Update initial ref so hasChanges resets
      initialSettingsRef.current = {
        settings: { ...settingsToSave },
        storagePath: pendingStoragePath || storagePath,
        autostart: launchOnStartup,
      };

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsChangingFolder(false);
    }
  }, [settings, pendingStoragePath, storagePath, launchOnStartup]);

  const handleChangeFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Storage Folder",
      });
      if (!selected) return;
      // Only set pending if it's actually different from current path
      if (selected === storagePath) return;
      setPendingStoragePath(selected as string);
    } catch (err) {
      console.error("Failed to open folder picker:", err);
    }
  }, [storagePath]);

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
        <button
          onClick={() => getCurrentWindow().hide()}
          className="group w-8 h-8 -mr-2 rounded-lg flex items-center justify-center text-fg-faint hover:bg-danger/15 hover:text-danger transition-all duration-200 cursor-pointer"
          aria-label="Close to tray"
        >
          <X className="w-4 h-4 transition-transform duration-150 group-hover:scale-110" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Shortcut */}
        <SettingSection
          icon={<Keyboard className="w-4 h-4" />}
          title="Global Shortcut"
          description="Key to summon AttachBox"
        >
          <div className="relative" ref={dropdownRef}>
            {/* Trigger button */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                "flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all duration-200 cursor-pointer min-w-22.5 justify-between",
                isDropdownOpen
                  ? "bg-surface-2 border-accent/50 text-fg shadow-[0_0_12px_oklch(0.60_0.25_280/0.15)]"
                  : "bg-surface-3 border-border text-fg hover:border-border-hover",
              )}
            >
              <span className="text-accent text-[11px]">
                {settings.shortcut_key}
              </span>
              <motion.div
                animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-3 h-3 text-fg-faint" />
              </motion.div>
            </button>

            {/* Dropdown panel */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 top-full mt-1.5 z-50 w-56 max-h-64 overflow-y-auto rounded-xl bg-surface-1 border border-border shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
                >
                  {KEY_GROUPS.map((group, gi) => (
                    <div key={group.label}>
                      {gi > 0 && <div className="h-px bg-border mx-2" />}
                      <div className="px-3 pt-2.5 pb-1">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-fg-faint">
                          {group.label}
                        </span>
                      </div>
                      <div className="px-1.5 pb-1.5">
                        <div className="flex flex-wrap gap-1">
                          {group.keys.map((key) => {
                            const isActive = settings.shortcut_key === key;
                            return (
                              <button
                                key={key}
                                onClick={() => {
                                  setSettings({
                                    ...settings,
                                    shortcut_key: key,
                                  });
                                  setIsDropdownOpen(false);
                                }}
                                className={cn(
                                  "relative flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono transition-all duration-150 cursor-pointer",
                                  isActive
                                    ? "bg-accent/15 text-accent border border-accent/30"
                                    : "text-fg-secondary hover:bg-surface-3 hover:text-fg border border-transparent",
                                )}
                              >
                                {isActive && (
                                  <Check
                                    className="w-2.5 h-2.5"
                                    strokeWidth={3}
                                  />
                                )}
                                {key}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </SettingSection>

        {/* Storage path */}
        <div className="p-4 rounded-xl bg-surface-1 border border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center text-fg-muted shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-fg">
                  Storage Location
                </h3>
                <p
                  className={cn(
                    "text-[11px] mt-0.5",
                    pendingStoragePath
                      ? "text-accent font-medium"
                      : "text-fg-muted",
                  )}
                >
                  {pendingStoragePath
                    ? "⚠ Save to apply folder change"
                    : "Where media files are stored"}
                </p>
              </div>
            </div>
            <button
              onClick={handleChangeFolder}
              disabled={isChangingFolder}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-200 cursor-pointer shrink-0",
                isChangingFolder
                  ? "bg-surface-2 border-border text-fg-faint cursor-wait"
                  : "bg-surface-3 border-border text-fg-secondary hover:border-border-hover hover:text-fg",
              )}
            >
              {isChangingFolder ? "Moving..." : "Change"}
            </button>
          </div>
          <code
            className={cn(
              "block px-3 py-2 rounded-lg text-[10px] font-mono border overflow-x-auto whitespace-nowrap",
              pendingStoragePath
                ? "bg-accent/5 text-accent border-accent/25"
                : "bg-surface-2 text-fg-muted border-border",
            )}
          >
            {pendingStoragePath || storagePath}
          </code>
        </div>

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

        {/* Launch on Startup */}
        <SettingSection
          icon={<Power className="w-4 h-4" />}
          title="Launch on Startup"
          description="Start AttachBox when you log in"
        >
          <button
            onClick={() => setLaunchOnStartup(!launchOnStartup)}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors duration-300 cursor-pointer",
              launchOnStartup ? "bg-accent" : "bg-surface-4",
            )}
          >
            <motion.div
              animate={{ x: launchOnStartup ? 22 : 3 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
            />
          </button>
        </SettingSection>
      </div>

      {/* Save */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <button
          onClick={handleSave}
          disabled={!hasChanges && !isSaved}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300",
            isSaved
              ? "bg-success/15 text-success border border-success/25"
              : hasChanges
                ? "bg-accent hover:bg-accent-hover text-white cursor-pointer"
                : "bg-surface-3 text-fg-faint border border-border cursor-not-allowed",
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
