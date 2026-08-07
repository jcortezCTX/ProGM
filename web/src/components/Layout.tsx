import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const PROJECT_LOG_PLACEHOLDERS = ["Custom Log"];
const FUTURE_MODULES: string[] = [];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">
          <span className="app-logo-mark">O</span>
          <span className="app-logo-text">
            OPS<span className="accent">HUB</span>
          </span>
        </span>
        {user && (
          <span className="app-user">
            <span className="app-user-avatar">{initials(user.display_name)}</span>
            {user.display_name}
            <button type="button" className="button-secondary" onClick={() => logout()}>
              Log out
            </button>
          </span>
        )}
      </header>
      <div className="app-body">
        <nav className="app-sidebar">
          <NavLink to="/inventory" className={({ isActive }) => (isActive ? "active" : "")}>
            Inventory
          </NavLink>

          <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
            Tasks
          </NavLink>

          <NavLink to="/schedule" className={({ isActive }) => (isActive ? "active" : "")}>
            Schedule
          </NavLink>

          <details className="sidebar-group" open>
            <summary className="sidebar-group-toggle">
              Project Logs
              <span className="sidebar-group-chevron" aria-hidden="true">
                &rsaquo;
              </span>
            </summary>
            <div className="sidebar-group-items">
              <NavLink to="/deliveries" className={({ isActive }) => (isActive ? "active" : "")}>
                Delivery Log
              </NavLink>
              <NavLink to="/mechanical-log" className={({ isActive }) => (isActive ? "active" : "")}>
                Mechanical Log
              </NavLink>
              <NavLink to="/drawings" className={({ isActive }) => (isActive ? "active" : "")}>
                Drawing Log
              </NavLink>
              <NavLink to="/concrete" className={({ isActive }) => (isActive ? "active" : "")}>
                Concrete Log
              </NavLink>
              {PROJECT_LOG_PLACEHOLDERS.map((name) => (
                <span key={name} className="tab-placeholder" title="Coming soon">
                  {name}
                </span>
              ))}
            </div>
          </details>

          {FUTURE_MODULES.map((name) => (
            <span key={name} className="tab-placeholder" title="Coming soon">
              {name}
            </span>
          ))}

          {user?.role === "admin" && (
            <NavLink to="/admin/users" className={({ isActive }) => (isActive ? "active" : "")}>
              Admin
            </NavLink>
          )}
        </nav>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
