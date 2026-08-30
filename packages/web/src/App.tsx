import { useEffect, useRef, useState } from "react";
import { Cpu, Radio, Terminal, Upload, Download, ArrowLeft, FileCode2 } from "lucide-react";
import { createRun, getFailure, getRun, subscribeRun, type FailureDetail, type Progress, type RunRecord } from "./api";
import { getLogoMotion } from "./logo-motion";

type Screen = "landing" | "exploring" | "report" | "detail" | "no_failure" | "error";
const initialProgress: Progress = { runId: "", phase: "queued", percentage: 0, message: "INITIALIZING", testedSchedules: 0, failureCount: 0 };

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing"); const [progress, setProgress] = useState(initialProgress);
  const [run, setRun] = useState<RunRecord>(); const [detail, setDetail] = useState<FailureDetail>(); const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false); const input = useRef<HTMLInputElement>(null); const movingLogo = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const motion = getLogoMotion(window.scrollY, window.innerWidth, window.innerHeight);
        if (!movingLogo.current) return;
        Object.assign(movingLogo.current.style, { left: `${motion.left}px`, top: `${motion.top}px`, width: `${motion.width}px`, transform: `translate(${motion.translateXPercent}%, -50%)` });
      });
    };
    window.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update); update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  const start = async (file?: File) => {
    if (!file) return; if (!/\.ya?ml$/i.test(file.name)) { setError("SELECT_A_COMPOSE_YAML_FILE"); return; }
    try {
      const { runId } = await createRun(file); setProgress({ ...initialProgress, runId, phase: "exploring", message: "SCANNING_NODES", percentage: 4 }); setScreen("exploring");
      const close = subscribeRun(runId, async (next) => {
        setProgress(next);
        if (["completed", "no_failure", "error"].includes(next.phase)) {
          close(); const record = await getRun(runId); setRun(record);
          if (next.phase === "completed") setScreen("report"); else if (next.phase === "no_failure") setScreen("no_failure"); else { setError(record.error ?? next.message); setScreen("error"); }
        }
      }, () => { setError("CONNECTION_TO_DEBUG_CORE_LOST"); setScreen("error"); });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "UPLOAD_FAILED"); }
  };
  const openDetail = async (failureId: string) => { if (!run) return; try { setDetail(await getFailure(run.id, failureId)); setScreen("detail"); } catch (cause) { setError(cause instanceof Error ? cause.message : "DETAIL_FAILED"); setScreen("error"); } };
  const reset = () => { setScreen("landing"); setRun(undefined); setDetail(undefined); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div className="app">
    <header className="nav"><button className="brand" onClick={reset} aria-label="DSRD home">{screen !== "landing" && <img className="docked-logo" src="/dsrd-logo.png" alt=""/>}</button><div className="nav-icons"><Cpu size={15}/><Radio size={15}/><Terminal size={16}/></div></header>
    {screen === "landing" && <main>
      <img ref={movingLogo} src="/dsrd-logo.png" className="moving-logo" alt="DSRD"/>
      <section className="hero"><div className="scroll-cue">SCROLL_TO_INITIALIZE<br/><span>↓</span></div></section>
      <section className="upload-section"><div className="section-title">[ INITIALIZE_SEQUENCE ]</div><button className={`drop-zone ${dragging ? "dragging" : ""}`} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void start(e.dataTransfer.files[0]); }}><span className="corner">IN</span><Upload size={38} strokeWidth={2.4}/><strong>DRAG_AND_DROP_COMPOSE_FILE</strong><span>OR_CLICK_TO_BROWSE</span><small>SUPPORTED_FORMATS: .YAML, .YML</small></button><input ref={input} className="sr-only" aria-label="Compose file" type="file" accept=".yaml,.yml" onChange={(e) => void start(e.target.files?.[0])}/>{error && <p className="inline-error">{error}</p>}<p className="constraint">SELF-CONTAINED COMPOSE FILES ONLY // LOCAL BUILD CONTEXTS REQUIRE COMPANION FILE SUPPORT</p></section>
    </main>}
    {screen === "exploring" && <main className="screen exploring"><h1>EXPLORING<span className="blink">..._</span></h1><div className="progress-meta"><span>{progress.message}</span><span>{progress.percentage}%</span></div><div className="progress-track"><div style={{ width: `${progress.percentage}%` }}/></div><div className="system-row"><span>SYS_MEM: 0x7F8C4B</span><span>TESTED: {String(progress.testedSchedules).padStart(3,"0")}</span></div><div className="failure-count">FAILURES: {String(progress.failureCount).padStart(2,"0")}</div></main>}
    {screen === "report" && <main className="screen report"><h2>FAILURES: {String(run?.failures.length ?? 0).padStart(2,"0")}</h2><div className="failure-table" role="table"><div className="row heading"><span>FAILURE_NAME</span><span>SEVERITY</span></div>{run?.failures.map((failure) => <button className="row" key={failure.id} onClick={() => void openDetail(failure.id)}><span>[{failure.name}]</span><span>{failure.severity.toUpperCase()}</span></button>)}</div><a className="export" href={`/api/runs/${run?.id}/report`} download><Download size={14}/> EXPORT_REPORT</a></main>}
    {screen === "detail" && detail && <main className="screen detail"><button className="back" onClick={() => setScreen("report")}><ArrowLeft size={14}/> BACK_TO_REPORT</button><h2><Cpu size={17}/> TRACE: <span>[{detail.id.toUpperCase()}]</span></h2><div className="timeline">{detail.events.map((event, index) => <div className={`event ${/fail|error|refused|fatal/i.test(event.event) ? "fatal" : ""}`} key={`${event.timeMs}-${index}`}><time>[T+{(event.timeMs/1000).toFixed(3)}s]</time><b>{event.event.toUpperCase()}</b><p>{event.service} // {event.detail ?? detail.reason}</p></div>)}</div><details><summary><FileCode2 size={14}/> VIEW_RAW_SCHEDULE</summary><pre>{JSON.stringify(detail.minimizedSchedule, null, 2)}</pre></details></main>}
    {screen === "no_failure" && <State title="NO_FAILURE_FOUND" text="The explored schedules completed without a deterministic startup race." reset={reset}/>} {screen === "error" && <State title="EXECUTION_ERROR" text={error} reset={reset}/>} 
  </div>;
}
function State({ title, text, reset }: { title: string; text: string; reset: () => void }) { return <main className="screen state"><Terminal size={42}/><h1>{title}</h1><p>{text}</p><button onClick={reset}>[ TRY_ANOTHER_TARGET ]</button></main>; }
