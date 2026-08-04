import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { InventoryListPage } from "./pages/InventoryListPage";
import { InventoryDetailPage } from "./pages/InventoryDetailPage";
import { DeliveriesListPage } from "./pages/DeliveriesListPage";
import { DeliveryDetailPage } from "./pages/DeliveryDetailPage";
import { RequisitionsListPage } from "./pages/RequisitionsListPage";
import { RequisitionDetailPage } from "./pages/RequisitionDetailPage";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/inventory" replace />} />
        <Route path="/inventory" element={<InventoryListPage />} />
        <Route path="/inventory/:id" element={<InventoryDetailPage />} />
        <Route path="/deliveries" element={<DeliveriesListPage />} />
        <Route path="/deliveries/:id" element={<DeliveryDetailPage />} />
        <Route path="/requisitions" element={<RequisitionsListPage />} />
        <Route path="/requisitions/:id" element={<RequisitionDetailPage />} />
      </Route>
    </Routes>
  );
}

export default App;
