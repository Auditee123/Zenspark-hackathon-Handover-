import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./state/store";
import { ModeBar, Rail, TopBar, TracePane } from "./components/Shell";
import { Toasts } from "./components/ui";
import CommandCentre from "./screens/CommandCentre";
import Onboard from "./screens/Onboard";
import GapAnalysis from "./screens/GapAnalysis";
import PlanReview from "./screens/PlanReview";
import Scheduler from "./screens/Scheduler";
import Sessions from "./screens/Sessions";
import Assessment from "./screens/Assessment";
import Readiness from "./screens/Readiness";
import Ask from "./screens/Ask";
import { AgentRuns, GenericPause, GiverHome, JoinerHome } from "./screens/Other";

export default function App() {
  const { traceOpen } = useStore();
  return (
    <div className={`app${traceOpen ? " trace-open" : ""}`}>
      <Rail />
      <div className="mainwrap">
        <ModeBar />
        <TopBar />
        <main id="main">
          <Routes>
            <Route path="/" element={<CommandCentre />} />
            <Route path="/onboard" element={<Onboard />} />
            <Route path="/analysis" element={<GapAnalysis />} />
            <Route path="/review" element={<PlanReview />} />
            <Route path="/schedule" element={<Scheduler />} />
            <Route path="/session" element={<Sessions />} />
            <Route path="/assessment" element={<Assessment />} />
            <Route path="/readiness" element={<Readiness />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/runs" element={<AgentRuns />} />
            <Route path="/me" element={<JoinerHome />} />
            <Route path="/giver" element={<GiverHome />} />
            <Route path="/pause" element={<GenericPause />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {traceOpen && <TracePane />}
      <Toasts />
    </div>
  );
}
