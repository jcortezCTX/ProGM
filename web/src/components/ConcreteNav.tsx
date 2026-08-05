import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/concrete", label: "Dashboard", end: true },
  { to: "/concrete/pours", label: "Pours" },
  { to: "/concrete/weekly-report", label: "Weekly Report" },
  { to: "/concrete/pump-truck", label: "Pump Truck" },
  { to: "/concrete/credits", label: "Credits" },
  { to: "/concrete/mix-designs", label: "Mix Designs" },
  { to: "/concrete/settings", label: "Structures & Settings" },
];

export function ConcreteNav() {
  return (
    <nav className="concrete-subnav" aria-label="Concrete Log sections">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? "active" : "")}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
