import { Store } from "@tauri-apps/plugin-store";
import type { RemoteLibraryItem } from "@/types";

const STORE_PATH = "library.json";
const REMOTE_ITEMS_KEY = "remote-items";

function getStore() {
  return Store.load(STORE_PATH);
}

function sortItems(items: RemoteLibraryItem[]) {
  return [...items].sort((left, right) => right.created_at - left.created_at);
}

export async function getRemoteLibraryItems(): Promise<RemoteLibraryItem[]> {
  const store = await getStore();
  const items = (await store.get<RemoteLibraryItem[]>(REMOTE_ITEMS_KEY)) ?? [];
  return sortItems(items);
}

export async function addRemoteLibraryItem(
  item: RemoteLibraryItem,
): Promise<{ added: boolean; items: RemoteLibraryItem[] }> {
  const store = await getStore();
  const items = (await store.get<RemoteLibraryItem[]>(REMOTE_ITEMS_KEY)) ?? [];
  const exists = items.some(
    (current) =>
      current.source === item.source && current.source_url === item.source_url,
  );

  if (exists) {
    return { added: false, items: sortItems(items) };
  }

  const nextItems = sortItems([item, ...items]);
  await store.set(REMOTE_ITEMS_KEY, nextItems);
  await store.save();
  return { added: true, items: nextItems };
}

export async function removeRemoteLibraryItem(
  id: string,
): Promise<RemoteLibraryItem[]> {
  const store = await getStore();
  const items = (await store.get<RemoteLibraryItem[]>(REMOTE_ITEMS_KEY)) ?? [];
  const nextItems = items.filter((item) => item.id !== id);
  await store.set(REMOTE_ITEMS_KEY, nextItems);
  await store.save();
  return sortItems(nextItems);
}
