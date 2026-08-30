import type { Progress } from "./api";

export function ProgressDisplay({ progress }: { progress: Progress }) {
  return <>
    <div className="progress-meta"><span>{progress.message}</span><span>{progress.percentage}%</span></div>
    <div className="progress-track" role="progressbar" aria-label="Schedule exploration progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage}><div style={{ width: `${progress.percentage}%` }}/></div>
    <div className="system-row"><span>PHASE: {progress.phase.toUpperCase()}</span><span>TESTED: {String(progress.testedSchedules).padStart(3, "0")}</span></div>
  </>;
}
