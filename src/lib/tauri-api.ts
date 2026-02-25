import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaItem, AppSettings } from "@/types";

export async function getAllMedia(): Promise<MediaItem[]> {
  return invoke<MediaItem[]>("get_all_media");
}

export async function importFiles(paths: string[]): Promise<MediaItem[]> {
  return invoke<MediaItem[]>("import_files", { paths });
}

export async function importFromUrl(url: string): Promise<MediaItem> {
  return invoke<MediaItem>("import_from_url", { url });
}

export async function deleteMedia(id: string): Promise<void> {
  return invoke("delete_media", { id });
}

export async function selectAndPaste(
  id: string,
  autoPaste: boolean,
): Promise<void> {
  return invoke("select_and_paste", { id, autoPaste });
}

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function updateSettings(newSettings: AppSettings): Promise<void> {
  return invoke("update_settings", { newSettings });
}

export async function getStoragePath(): Promise<string> {
  return invoke<string>("get_storage_path");
}

export async function getMediaAssetPath(filename: string): Promise<string> {
  return invoke<string>("get_media_asset_path", { filename });
}

export function getAssetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

export async function updateShortcut(key: string): Promise<void> {
  return invoke("update_shortcut", { key });
}

export async function scanMedia(): Promise<MediaItem[]> {
  return invoke<MediaItem[]>("scan_media");
}

export async function changeStoragePath(newPath: string): Promise<string> {
  return invoke<string>("change_storage_path", { newPath });
}
