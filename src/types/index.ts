export type MediaType = "image" | "gif" | "video";

export interface MediaItem {
  id: string;
  filename: string;
  original_name: string;
  media_type: MediaType;
  file_size: number;
  created_at: number;
}

export interface RemoteLibraryItem {
  id: string;
  kind: "remote";
  name: string;
  preview_url: string;
  source_url: string;
  source: "7tv" | "tenor";
  media_type: MediaType;
  created_at: number;
}

export type LibraryItem = MediaItem | RemoteLibraryItem;

export interface AppSettings {
  shortcut_key: string;
  storage_path: string;
  auto_paste_enabled: boolean;
}

export type PageRoute = "gallery" | "settings";

export interface GalleryState {
  selectedIndex: number;
  columnCount: number;
}
