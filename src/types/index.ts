export type MediaType = "image" | "gif" | "video";

export interface MediaItem {
  id: string;
  filename: string;
  original_name: string;
  media_type: MediaType;
  file_size: number;
  created_at: number;
}

export interface AppSettings {
  shortcut_key: string;
  storage_path: string;
  auto_paste_enabled: boolean;
}

export type PageRoute = "gallery" | "upload" | "settings";

export interface GalleryState {
  selectedIndex: number;
  columnCount: number;
}
