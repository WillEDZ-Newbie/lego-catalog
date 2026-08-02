/** Extra context the hero controls need beyond a param's value. */
export interface PanelContext {
  /** Current step's input image (bare base64), if any. */
  inputImageB64?: string;
  /** Accepted results so far, for the Artist Lock seed rail. */
  frames: { blobKey: string; seed: string }[];
  /** The session's currently locked seed. */
  currentSeed: string;
  /** Recall a seed from the rail (also turns the lock on). */
  onRecallSeed: (seed: string) => void;
  /** Ghost Strip: render a small preview of the current stage at a strength. */
  previewStrength: (strength: number, signal: AbortSignal) => Promise<Blob>;
}
