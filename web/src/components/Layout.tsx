import { NavLink, Outlet } from "react-router-dom";

const FUTURE_MODULES = ["Deliveries", "Drawings", "Tasks", "Scheduling", "Custom Logs"];

// Phase 3 replaces this with the signed-in Azure AD user (CLAUDE.md: no auth before then).
const DEV_USER_NAME = "Dev User";
const DEV_USER_INITIALS = "DU";

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo">
          <span className="app-logo-mark">O</span>
          <span className="app-logo-text">
            OPS<span className="accent">HUB</span>
          </span>
        </span>
        <span className="app-user" title="Hardcoded until Phase 3 auth">
          <span className="app-user-avatar">{DEV_USER_INITIALS}</span>
          {DEV_USER_NAME}
        </span>
      </header>
      <nav className="app-tabs">
        <NavLink to="/inventory" className={({ isActive }) => (isActive ? "active" : "")}>
          Inventory
        </NavLink>
        {FUTURE_MODULES.map((name) => (
          <span key={name} className="tab-placeholder" title="Coming soon">
            {name}
          </span>
        ))}
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
