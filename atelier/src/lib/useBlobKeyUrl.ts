import { useEffect, useState } from "react";
import { getBlob } from "./db";
import { useObjectUrl } from "./useObjectUrl";

/** Load an IndexedDB blob by key → object URL, revoked on change/unmount. */
export function useBlobKeyUrl(key?: string): string | null {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let live = true;
    setBlob(null);
    if (key) getBlob(key).then((b) => live && setBlob(b ?? null));
    return () => {
      live = false;
    };
  }, [key]);
  return useObjectUrl(blob);
}
