import { useEffect, useState } from "react";

/**
 * Turn a Blob into an object URL and revoke it on change/unmount.
 * Memory discipline is a hard constraint (8GB target machine) — never leak
 * object URLs. See CLAUDE.md §3.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
