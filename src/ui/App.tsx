import { Navigate, Route, Routes } from "react-router-dom";
import BoardPage from "./BoardPage";
import AppShell from "./v3/layout/AppShell";
import AuditPage from "./v3/pages/AuditPage";
import CalendarPage from "./v3/pages/CalendarPage";
import DashboardPage from "./v3/pages/DashboardPage";
import SettingsPage from "./v3/pages/SettingsPage";
import TasksPage from "./v3/pages/TasksPage";

function NotFound() {
  return (
    <div className="h-full w-full grid place-items-center p-8">
      <div className="max-w-md text-center">
        <p className="text-sm text-text-secondary">404</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white">页面不存在</h1>
        <p className="mt-2 text-sm text-text-secondary">检查一下地址，或者从侧边栏进入。</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background-dark text-white">
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* V2 (for reference / comparison while refactoring) */}
        <Route path="/v2" element={<BoardPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
