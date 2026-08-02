/**
 * The Mask Painter. A full-screen canvas over the input image for painting an
 * inpainting mask. Brush size, softness (feather), eraser, invert, clear, and
 * pinch zoom/pan. Apple Pencil pressure maps to brush opacity via PointerEvent
 * (`pointerType === "pen"`, `event.pressure`). Exports a B/W PNG mask at source
 * resolution (white = the area to re-carve).
 *
 * NOTE: pointer/pinch behaviour is written to spec but tuned for real devices;
 * it can only be exercised on an actual iPad/desktop, not in CI.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { stripDataUrl } from "@/lib/image";

interface Pt { x: number; y: number; }

export function MaskPainter({
  imageB64,
  onDone,
  onCancel,
}: {
  imageB64: string;
  onDone: (maskB64: string) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [fitW, setFitW] = useState(0);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });

  const [brush, setBrush] = useState(48);
  const [feather, setFeather] = useState(0.5);
  const [eraser, setEraser] = useState(false);
  const [invert, setInvert] = useState(false);
  const [hasPaint, setHasPaint] = useState(false);

  const pointers = useRef<Map<number, Pt>>(new Map());
  const pinching = useRef(false);
  const lastMid = useRef<Pt | null>(null);
  const lastDist = useRef(0);
  const lastPaint = useRef<Pt | null>(null);
  const dataUrl = `data:image/webp;base64,${imageB64}`;

  // Load the image to learn its natural size and fit it to the viewport.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      const cw = containerRef.current?.clientWidth ?? window.innerWidth;
      const ch = containerRef.current?.clientHeight ?? window.innerHeight;
      const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight, 1);
      setFitW(img.naturalWidth * scale);
    };
    img.src = dataUrl;
  }, [dataUrl]);

  // Keyboard brush-size shortcuts on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "[") setBrush((b) => Math.max(5, b - 6));
      if (e.key === "]") setBrush((b) => Math.min(300, b + 6));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toImage = useCallback((clientX: number, clientY: number): Pt => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const fx = c.width / rect.width;
    const fy = c.height / rect.height;
    return { x: (clientX - rect.left) * fx, y: (clientY - rect.top) * fy };
  }, []);

  const stamp = useCallback(
    (p: Pt, pressure: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      const r = brush / 2;
      const alpha = Math.max(0.15, pressure || 1);
      g.globalCompositeOperation = eraser ? "destination-out" : "source-over";
      const grad = g.createRadialGradient(p.x, p.y, r * (1 - feather), p.x, p.y, r);
      grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    },
    [brush, eraser, feather],
  );

  const paintTo = useCallback(
    (p: Pt, pressure: number) => {
      const last = lastPaint.current;
      if (last) {
        // interpolate along the segment so fast strokes stay continuous
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const steps = Math.max(1, Math.floor(dist / (brush / 4)));
        for (let i = 1; i <= steps; i++) {
          stamp({ x: last.x + ((p.x - last.x) * i) / steps, y: last.y + ((p.y - last.y) * i) / steps }, pressure);
        }
      } else {
        stamp(p, pressure);
      }
      lastPaint.current = p;
      if (!hasPaint) setHasPaint(true);
    },
    [brush, stamp, hasPaint],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      pinching.current = true;
      lastPaint.current = null;
      return;
    }
    if (!pinching.current) paintTo(toImage(e.clientX, e.clientY), e.pointerType === "pen" ? e.pressure : 1);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastMid.current && lastDist.current) {
        const dScale = dist / lastDist.current;
        setView((v) => ({
          scale: Math.max(0.5, Math.min(8, v.scale * dScale)),
          tx: v.tx + (mid.x - lastMid.current!.x),
          ty: v.ty + (mid.y - lastMid.current!.y),
        }));
      }
      lastMid.current = mid;
      lastDist.current = dist;
      return;
    }
    if (!pinching.current) paintTo(toImage(e.clientX, e.clientY), e.pointerType === "pen" ? e.pressure : 1);
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      pinching.current = false;
      lastMid.current = null;
      lastDist.current = 0;
      lastPaint.current = null;
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasPaint(false);
  };

  const done = () => {
    const c = canvasRef.current;
    if (!c || !nat) return;
    const out = document.createElement("canvas");
    out.width = nat.w;
    out.height = nat.h;
    const g = out.getContext("2d")!;
    if (invert) {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, out.width, out.height);
      g.globalCompositeOperation = "destination-out";
      g.drawImage(c, 0, 0);
    } else {
      g.fillStyle = "#000";
      g.fillRect(0, 0, out.width, out.height);
      g.globalCompositeOperation = "source-over";
      g.drawImage(c, 0, 0);
    }
    onDone(stripDataUrl(out.toDataURL("image/png")));
  };

  return (
    <div className="mask-painter">
      <div
        ref={containerRef}
        className="mask-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {nat && (
          <div
            className="mask-wrapper"
            style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
          >
            <img src={dataUrl} alt="Paint over the area to work on" style={{ width: fitW }} draggable={false} />
            <canvas
              ref={canvasRef}
              width={nat.w}
              height={nat.h}
              style={{ width: fitW }}
              className="mask-canvas"
            />
          </div>
        )}
      </div>

      <div className="mask-tools">
        <div className="mask-tool">
          <label>Brush</label>
          <input type="range" min={5} max={300} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
        </div>
        <div className="mask-tool">
          <label>Softness</label>
          <input type="range" min={0} max={1} step={0.05} value={feather} onChange={(e) => setFeather(Number(e.target.value))} />
        </div>
        <button className={`chip-btn ${eraser ? "on" : ""}`} onClick={() => setEraser((v) => !v)}>Eraser</button>
        <button className={`chip-btn ${invert ? "on" : ""}`} onClick={() => setInvert((v) => !v)}>Invert</button>
        <button className="chip-btn" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}>Fit</button>
        <button className="chip-btn" onClick={clear}>Clear</button>
        <span className="mask-spacer" />
        <button className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button className="primary-btn" onClick={done} disabled={!hasPaint}>Use this mask</button>
      </div>
    </div>
  );
}
