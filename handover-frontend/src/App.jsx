import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Processing from './pages/Processing.jsx';
import GapsPlan from './pages/GapsPlan.jsx';
import Scheduler from './pages/Scheduler.jsx';
import Session from './pages/Session.jsx';
import Assessment from './pages/Assessment.jsx';

function Shell({ children }) {
  return (
    <div className="app">
      <Sidebar />
      <main className="page">{children}</main>
    </div>
  );
}

export default function App() {
  const routes = [
    ['/', Onboarding],
    ['/processing/:id?', Processing],
    ['/gaps/:id?', GapsPlan],
    ['/scheduler/:id?', Scheduler],
    ['/session/:id?', Session],
    ['/assessment/:id?', Assessment]
  ];
  return (
    <Routes>
      {routes.map(([path, Page]) => (
        <Route key={path} path={path} element={<Shell><Page /></Shell>} />
      ))}
    </Routes>
  );
}
