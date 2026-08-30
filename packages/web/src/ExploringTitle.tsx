export function getExploringDotDelay(index: number): number {
  return index * 180;
}

export function ExploringTitle() {
  return <h1 className="exploring-title">EXPLORING<span className="exploring-dots" aria-hidden="true">
    {[0, 1, 2].map((index) => <span className="exploring-dot" style={{ animationDelay: `${getExploringDotDelay(index)}ms` }} key={index}>.</span>)}
  </span></h1>;
}
