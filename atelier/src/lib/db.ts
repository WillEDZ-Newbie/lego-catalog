/**
 * IndexedDB persistence (via idb). Everything binary lives here — stage output
 * blobs, source images, thumbnails. localStorage holds only the API key +
 * small settings.
 *
 * History is append-only and immutable: every stage output is stored under a
 * stable key `session/{id}/{stepIndex}-{attempt}` and never mutated. Undo is
 * just a pointer move (see store/run.ts).
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "atelier";
const DB_VERSION = 1;
const BLOBS = "blobs";
const SESSIONS = "sessions";

/** Lightweight session record for the Home "recent sessions" row. */
export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  /** blob key of the latest accepted frame, for the thumbnail. */
  thumbKey?: string;
  frameCount: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS);
        if (!d.objectStoreNames.contains(SESSIONS)) d.createObjectStore(SESSIONS, { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  (await db()).put(BLOBS, blob, key);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get(BLOBS, key) as Promise<Blob | undefined>;
}

export async function deleteBlob(key: string): Promise<void> {
  (await db()).delete(BLOBS, key);
}

export async function saveSession(rec: SessionRecord): Promise<void> {
  (await db()).put(SESSIONS, rec);
}

export async function listSessions(limit = 12): Promise<SessionRecord[]> {
  const all = (await (await db()).getAll(SESSIONS)) as SessionRecord[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export async function deleteSession(id: string): Promise<void> {
  (await db()).delete(SESSIONS, id);
}
