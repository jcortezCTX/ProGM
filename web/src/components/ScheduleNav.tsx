import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/schedule/activities", label: "Activities" },
  { to: "/schedule/lookahead", label: "6 Week Lookahead" },
  { to: "/schedule/settings", label: "Sections & Holidays" },
];

export function ScheduleNav() {
  return (
    <nav className="concrete-subnav" aria-label="Schedule sections">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? "active" : "")}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
