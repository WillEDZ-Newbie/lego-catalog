/**
 * Typed AI Horde v2 client: submit → poll check → fetch status → download R2.
 *
 * Design notes (see CLAUDE.md "Horde etiquette & resilience"):
 *  - `r2: true` is forced on every submit; images come back as R2 URLs.
 *  - `check` is polled at a 1s floor, backing off to 3s after 30s in queue
 *    (the server caches check for 1s, so faster polling is wasteful & rude).
 *  - In-flight jobs are cancelled with DELETE when the caller aborts.
 *  - Errors are surfaced as `HordeUserError` with plain-language messages;
 *    callers should never show a raw error string to the artist.
 */
import type {
  HordeActiveModel,
  HordeAsyncResponse,
  HordeCheck,
  HordeGenerationInput,
  HordeStatus,
} from "./types";

const DEFAULT_BASE = "https://stablehorde.net/api";
export const ANON_KEY = "0000000000";
const CLIENT_AGENT = "ATELIER:0.1:github.com/atelier"; // VERIFY: Horde asks for name:version:contact

export interface HordeClientOptions {
  /** Called for each request; returns the current key (or anon). */
  getApiKey: () => string;
  baseUrl?: string;
}

/** A failure we are happy to show the artist, in their language. */
export class HordeUserError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "network"
      | "rejected"
      | "faulted"
      | "aborted"
      | "not-possible"
      | "server",
    readonly status?: number,
  ) {
    super(message);
    this.name = "HordeUserError";
  }
}

/** Progress emitted while a job is in the queue. */
export interface GenerateProgress {
  check: HordeCheck;
  /** Seconds since submit. */
  elapsed: number;
}

export interface GenerateResult {
  status: HordeStatus;
  /** Downloaded images as Blobs (never data-URLs — memory discipline). */
  blobs: Blob[];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export function imgIsUrl(img: string): boolean {
  return /^https?:\/\//i.test(img);
}

export class HordeClient {
  private base: string;
  private getApiKey: () => string;
  private modelCache?: { at: number; models: HordeActiveModel[] };

  constructor(opts: HordeClientOptions) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.getApiKey = opts.getApiKey;
  }

  private headers(withKey = true): HeadersInit {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "Client-Agent": CLIENT_AGENT,
    };
    if (withKey) h["apikey"] = this.getApiKey() || ANON_KEY;
    return h;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { withKey?: boolean } = {},
  ): Promise<T> {
    const { withKey = true, ...rest } = init;
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...rest,
        headers: { ...this.headers(withKey), ...(rest.headers ?? {}) },
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new HordeUserError(
        "Couldn't reach the volunteer network. Check your connection and try again — nothing was lost.",
        "network",
      );
    }
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json())?.message ?? "";
      } catch {
        /* ignore */
      }
      throw new HordeUserError(
        detail || `The service replied with an error (${res.status}).`,
        res.status >= 500 ? "server" : "rejected",
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  /* --- Simple endpoints ------------------------------------------------- */

  async heartbeat(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.request("/v2/status/heartbeat", { withKey: false, signal });
      return true;
    } catch {
      return false;
    }
  }

  /** Active image models, sorted by worker count. Cached for `ttlMs`. */
  async getImageModels(ttlMs = 60_000, signal?: AbortSignal): Promise<HordeActiveModel[]> {
    const now = performanceNow();
    if (this.modelCache && now - this.modelCache.at < ttlMs) {
      return this.modelCache.models;
    }
    const all = await this.request<HordeActiveModel[]>(
      "/v2/status/models?type=image",
      { withKey: false, signal },
    );
    const models = [...all].sort((a, b) => b.count - a.count);
    this.modelCache = { at: now, models };
    return models;
  }

  /* --- The generation loop --------------------------------------------- */

  /** POST /v2/generate/async. Forces `r2: true`. */
  async submit(input: HordeGenerationInput, signal?: AbortSignal): Promise<HordeAsyncResponse> {
    const body: HordeGenerationInput = { ...input, r2: true };
    return this.request<HordeAsyncResponse>("/v2/generate/async", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
  }

  async check(id: string, signal?: AbortSignal): Promise<HordeCheck> {
    return this.request<HordeCheck>(`/v2/generate/check/${id}`, {
      withKey: false,
      signal,
    });
  }

  async status(id: string, signal?: AbortSignal): Promise<HordeStatus> {
    return this.request<HordeStatus>(`/v2/generate/status/${id}`, {
      withKey: false,
      signal,
    });
  }

  /** DELETE /v2/generate/status/{id} — cancel but keep whatever finished. */
  async cancel(id: string): Promise<HordeStatus | null> {
    try {
      return await this.request<HordeStatus>(`/v2/generate/status/${id}`, {
        method: "DELETE",
        withKey: false,
      });
    } catch {
      return null; // best-effort; caller is already tearing down
    }
  }

  /**
   * Full orchestrated generation. Submits, polls with etiquette-correct
   * backoff, fetches the final status, and downloads each R2 image as a Blob.
   * Abort via `signal` — the in-flight job is DELETE-cancelled server-side.
   */
  async generate(
    input: HordeGenerationInput,
    opts: {
      signal?: AbortSignal;
      onSubmitted?: (r: HordeAsyncResponse) => void;
      onProgress?: (p: GenerateProgress) => void;
    } = {},
  ): Promise<GenerateResult> {
    const { signal, onSubmitted, onProgress } = opts;
    const submitted = await this.submit(input, signal);
    onSubmitted?.(submitted);
    const id = submitted.id;

    const startedAt = performanceNow();
    try {
      // Poll loop
      for (;;) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const check = await this.check(id, signal);
        const elapsed = (performanceNow() - startedAt) / 1000;
        onProgress?.({ check, elapsed });

        if (!check.is_possible && check.waiting === 0 && check.processing === 0) {
          throw new HordeUserError(
            "No volunteer worker can currently make this image (the model or settings may be unavailable). Try a different model or simpler settings.",
            "not-possible",
          );
        }
        if (check.faulted) {
          throw new HordeUserError(
            "The volunteer network dropped this job. Try again — nothing was lost.",
            "faulted",
          );
        }
        if (check.done) break;

        // Etiquette: 1s floor, ease to 3s once we've been waiting a while.
        const interval = elapsed > 30 ? 3000 : 1000;
        await sleep(interval, signal);
      }

      const status = await this.status(id, signal);
      const blobs = await Promise.all(
        status.generations.map((g) => this.fetchImage(g.img, signal)),
      );
      return { status, blobs };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        void this.cancel(id); // fire-and-forget; keep partials server-side
        throw new HordeUserError("Generation stopped.", "aborted");
      }
      throw e;
    }
  }

  /** Download a finished image. With r2:true `img` is a URL; otherwise b64. */
  async fetchImage(img: string, signal?: AbortSignal): Promise<Blob> {
    if (!imgIsUrl(img)) {
      // Fallback: inline base64 (webp). Decode to a Blob so callers are uniform.
      const bin = atob(img);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: "image/webp" });
    }
    const res = await fetch(img, { signal });
    if (!res.ok) {
      throw new HordeUserError("Couldn't download the finished image.", "network", res.status);
    }
    return res.blob();
  }
}

/** performance.now() is monotonic and safe in browsers; guard for SSR/tests. */
function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}
