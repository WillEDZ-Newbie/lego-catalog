/**
 * Before/after comparison for the judgement screen.
 *  - A/B slider: drag the divider to wipe between input and output.
 *  - Press-and-hold anywhere else: momentarily reveal the full input; release
 *    to return to the output.
 *  - Reveal motion: the output rises over the input like a plaster cast being
 *    lifted (respects prefers-reduced-motion via the --dur-reveal token).
 *
 * With no "before" (e.g. Fresh generation), it just shows the output.
 */
import { useRef, useState } from "react";
import { useBlobKeyUrl } from "@/lib/useBlobKeyUrl";

export function CompareView({
  beforeKey,
  afterKey,
}: {
  beforeKey?: string;
  afterKey: string;
}) {
  const beforeUrl = useBlobKeyUrl(beforeKey);
  const afterUrl = useBlobKeyUrl(afterKey);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [holding, setHolding] = useState(false);
  const dragging = useRef(false);

  const setFromClientX = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  // Handle drag (A/B slider)
  const onHandleDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragging.current = true;
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragging.current) setFromClientX(e.clientX);
  };
  const onHandleUp = () => {
    dragging.current = false;
  };

  const displayPos = holding ? 100 : pos;
  const hasBefore = Boolean(beforeUrl);

  return (
    <div
      ref={ref}
      className="compare2 cmp-reveal"
      onPointerDown={() => hasBefore && setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
    >
      {afterUrl && <img className="cmp-after" src={afterUrl} alt="Result" draggable={false} />}

      {hasBefore && (
        <>
          <div
            className="cmp-before-layer"
            style={{ clipPath: `inset(0 ${100 - displayPos}% 0 0)` }}
          >
            <img src={beforeUrl!} alt="Input" draggable={false} />
          </div>

          <div className="cmp-labels" aria-hidden="true">
            <span>Before</span>
            <span>After</span>
          </div>

          <div
            className="cmp-handle"
            style={{ left: `${displayPos}%` }}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            role="slider"
            aria-label="Compare before and after"
            aria-valuenow={Math.round(displayPos)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 4));
              if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 4));
            }}
          >
            <span className="cmp-grip" aria-hidden="true" />
          </div>

          <p className="cmp-hint">Drag to compare · press and hold to see the original</p>
        </>
      )}
    </div>
  );
}
