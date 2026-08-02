import { useEffect, useState } from "react";
import { getBlob } from "@/lib/db";
import { useObjectUrl } from "@/lib/useObjectUrl";

/** Load a blob from IndexedDB by key and render it, revoking the URL on change. */
export function BlobImage({
  blobKey,
  alt,
  className,
}: {
  blobKey: string | undefined;
  alt: string;
  className?: string;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let live = true;
    setBlob(null);
    if (blobKey) getBlob(blobKey).then((b) => live && setBlob(b ?? null));
    return () => {
      live = false;
    };
  }, [blobKey]);
  const url = useObjectUrl(blob);
  if (!url) return <div className={`blob-image placeholder ${className ?? ""}`} aria-hidden="true" />;
  return <img src={url} alt={alt} className={`blob-image ${className ?? ""}`} />;
}
