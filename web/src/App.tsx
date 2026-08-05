import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { InventoryListPage } from "./pages/InventoryListPage";
import { InventoryDetailPage } from "./pages/InventoryDetailPage";
import { DeliveriesListPage } from "./pages/DeliveriesListPage";
import { DeliveryDetailPage } from "./pages/DeliveryDetailPage";
import { RequisitionsListPage } from "./pages/RequisitionsListPage";
import { RequisitionDetailPage } from "./pages/RequisitionDetailPage";
import { MechanicalLogListPage } from "./pages/MechanicalLogListPage";
import { MechanicalLogDetailPage } from "./pages/MechanicalLogDetailPage";
import { DrawingsListPage } from "./pages/DrawingsListPage";
import { DrawingDetailPage } from "./pages/DrawingDetailPage";
import { TasksListPage } from "./pages/TasksListPage";
import { LoginPage } from "./pages/LoginPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { RequireAuth, RequireRole } from "./auth/RequireAuth";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/inventory" replace />} />
          <Route path="/inventory" element={<InventoryListPage />} />
          <Route path="/inventory/:id" element={<InventoryDetailPage />} />
          <Route path="/deliveries" element={<DeliveriesListPage />} />
          <Route path="/deliveries/:id" element={<DeliveryDetailPage />} />
          <Route path="/requisitions" element={<RequisitionsListPage />} />
          <Route path="/requisitions/:id" element={<RequisitionDetailPage />} />
          <Route path="/mechanical-log" element={<MechanicalLogListPage />} />
          <Route path="/mechanical-log/:id" element={<MechanicalLogDetailPage />} />
          <Route path="/drawings" element={<DrawingsListPage />} />
          <Route path="/drawings/:id" element={<DrawingDetailPage />} />
          <Route path="/tasks" element={<TasksListPage />} />
          <Route path="/tasks/:id" element={<TasksListPage />} />
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
