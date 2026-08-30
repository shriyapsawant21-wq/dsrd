import { useLayoutEffect, useRef, useState } from "react";
import { Cpu, Radio, Terminal, Upload, Download, ArrowLeft, FileCode2, Moon, Sun } from "lucide-react";
import { createRun, getFailure, getRun, subscribeRun, type FailureDetail, type Progress, type RunRecord } from "./api";
import { getLogoMotion } from "./logo-motion";
import { getDemoFailureDetail, getReportFailures } from "./report-data";
import { getInitialTheme, toggleTheme, type Theme } from "./theme";
import { ScrollCue } from "./ScrollCue";
import "./folder-picker.css";

type Screen = "landing" | "exploring" | "report" | "detail" | "no_failure" | "error";
const initialProgress: Progress = { runId: "", phase: "queued", percentage: 0, message: "INITIALIZING", testedSchedules: 0, failureCount: 0 };

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing"); const [progress, setProgress] = useState(initialProgress);
  const [run, setRun] = useState<RunRecord>(); const [detail, setDetail] = useState<FailureDetail>(); const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme(localStorage.getItem("dsrd-theme")));
  const [selectedFolder, setSelectedFolder] = useState("");
  const [dragging, setDragging] = useState(false); const input = useRef<HTMLInputElement>(null); const movingLogo = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const applyPosition = () => {
      const motion = getLogoMotion(window.scrollY, window.innerWidth, window.innerHeight);
      if (!movingLogo.current) return;
      Object.assign(movingLogo.current.style, { left: `${motion.left}px`, top: `${motion.top}px`, width: `${motion.width}px`, transform: `translate(${motion.translateXPercent}%, -50%)` });
    };
    const schedulePosition = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(applyPosition); };
    applyPosition();
    window.addEventListener("scroll", schedulePosition, { passive: true }); window.addEventListener("resize", schedulePosition);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedulePosition); window.removeEventListener("resize", schedulePosition); };
  }, [screen]);
  const start = async (files?: Iterable<File>) => {
    const projectFiles = files ? [...files] : [];
    if (projectFiles.length === 0) { setError("SELECT_A_COMPOSE_PROJECT_FOLDER"); return; }
    try {
      const { runId } = await createRun(projectFiles); setProgress({ ...initialProgress, runId, phase: "exploring", message: "SCANNING_NODES", percentage: 4 }); setScreen("exploring");
      const close = subscribeRun(runId, async (next) => {
        setProgress(next);
        if (["completed", "no_failure", "error"].includes(next.phase)) {
          close(); const record = await getRun(runId); setRun(record);
          if (next.phase === "completed") setScreen("report"); else if (next.phase === "no_failure") setScreen("no_failure"); else { setError(record.error ?? next.message); setScreen("error"); }
        }
      }, () => { setError("CONNECTION_TO_DEBUG_CORE_LOST"); setScreen("error"); });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "UPLOAD_FAILED"); }
  };
  const selectProject = (files?: FileList | null) => {
    if (!files?.length) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    setSelectedFolder((first.webkitRelativePath || first.name).split(/[\\/]/)[0]);
    void start(files);
  };
  const openDetail = async (failureId: string) => { if (!run) return; try { setDetail(await getFailure(run.id, failureId)); } catch { setDetail(getDemoFailureDetail()); } setScreen("detail"); };
  const reset = () => { window.scrollTo({ top: 0, behavior: "auto" }); setScreen("landing"); setRun(undefined); setDetail(undefined); setSelectedFolder(""); setError(""); };
  const reportFailures = getReportFailures(run?.failures);
  const switchTheme = () => { const next = toggleTheme(theme); localStorage.setItem("dsrd-theme", next); setTheme(next); };
  return <div className="app" data-theme={theme}>
    <header className="nav"><button className="brand" onClick={reset} aria-label="DSRD home">{screen !== "landing" && <img className="docked-logo" src="/dsrd-logo.png" alt=""/>}</button><div className="nav-icons"><Cpu size={15}/><Radio size={15}/><Terminal size={16}/><button className="theme-toggle" onClick={switchTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button></div></header>
    {screen === "landing" && <main>
      <img ref={movingLogo} src="/dsrd-logo.png" className="moving-logo" alt="DSRD"/>
      <section className="hero"><ScrollCue/></section>
      <section className="upload-section"><div className="section-title">[ INITIALIZE_SEQUENCE ]</div><button className={`drop-zone ${dragging ? "dragging" : ""}`} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); selectProject(e.dataTransfer.files); }}><span className="corner">IN</span><Upload size={38} strokeWidth={2.4}/><strong>SELECT_PROJECT_FOLDER</strong><span>OR_DRAG_AND_DROP_PROJECT_FILES</span><small>INCLUDES_SOURCE_DOCKERFILES_AND_CONFIG</small></button><input ref={input} className="sr-only" aria-label="Project folder" type="file" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => selectProject(e.target.files)}/>{selectedFolder && <p className="selected-folder">PROJECT: {selectedFolder}</p>}{error && <p className="inline-error">{error}</p>}<p className="constraint">SELECT A PROJECT FOLDER // RELATIVE BUILD CONTEXTS ARE PRESERVED</p></section>
    </main>}
    {screen === "exploring" && <main className="screen exploring"><h1>EXPLORING<span className="blink">..._</span></h1><div className="progress-meta"><span>{progress.message}</span><span>{progress.percentage}%</span></div><div className="progress-track"><div style={{ width: `${progress.percentage}%` }}/></div><div className="system-row"><span>SYS_MEM: 0x7F8C4B</span><span>TESTED: {String(progress.testedSchedules).padStart(3,"0")}</span></div><div className="failure-count">FAILURES: {String(progress.failureCount).padStart(2,"0")}</div></main>}
    {screen === "report" && <main className="screen report"><h2>FAILURES: {String(reportFailures.length).padStart(2,"0")}</h2><div className="failure-table" role="table"><div className="row heading"><span>FAILURE_NAME</span><span>SEVERITY</span></div>{reportFailures.map((failure) => <button className="row" key={failure.id} onClick={() => void openDetail(failure.id)}><span>[{failure.name}]</span><span>{failure.severity.toUpperCase()}</span></button>)}</div><a className="export" href={`/api/runs/${run?.id}/report`} download><Download size={14}/> EXPORT_REPORT</a></main>}
    {screen === "detail" && detail && <main className="screen detail"><button className="back" onClick={() => setScreen("report")}><ArrowLeft size={14}/> BACK_TO_REPORT</button><h2><Cpu size={17}/> TRACE: <span>[{detail.id.toUpperCase()}]</span></h2><div className="timeline">{detail.events.map((event, index) => <div className={`event ${/fail|error|refused|fatal/i.test(event.event) ? "fatal" : ""}`} key={`${event.timeMs}-${index}`}><time>[T+{(event.timeMs/1000).toFixed(3)}s]</time><b>{event.event.toUpperCase()}</b><p>{event.service} // {event.detail ?? detail.reason}</p></div>)}</div><details><summary><FileCode2 size={14}/> VIEW_RAW_SCHEDULE</summary><pre>{JSON.stringify(detail.minimizedSchedule, null, 2)}</pre></details></main>}
    {screen === "no_failure" && <State title="NO_FAILURE_FOUND" text="The explored schedules completed without a deterministic startup race." reset={reset}/>} {screen === "error" && <State title="EXECUTION_ERROR" text={error} reset={reset}/>} 
  </div>;
}
function State({ title, text, reset }: { title: string; text: string; reset: () => void }) { return <main className="screen state"><Terminal size={42}/><h1>{title}</h1><p>{text}</p><button onClick={reset}>[ TRY_ANOTHER_TARGET ]</button></main>; }
