export function ScrollCue({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;
  return <div className="scroll-cue" aria-label="Scroll down"><span aria-hidden="true">↓</span></div>;
}
