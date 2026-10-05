import { CalendarDays, Package, Pill, Sparkles, Stethoscope, UserCog, Users } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell, ComingSoon } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import DashboardPage from "./pages/DashboardPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import LoginPage from "./pages/LoginPage";
import NewInvoicePage from "./pages/NewInvoicePage";
import PaymentsPage from "./pages/PaymentsPage";
import RefundsPage from "./pages/RefundsPage";
import ReportsPage from "./pages/ReportsPage";
import ServicesPage from "./pages/ServicesPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ivory text-gold-700">
        <Spinner size={28} />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<NewInvoicePage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="refunds" element={<RefundsPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="appointments" element={<ComingSoon title="Appointments" icon={CalendarDays} />} />
        <Route path="patients" element={<ComingSoon title="Patient records" icon={Users} />} />
        <Route path="consultations" element={<ComingSoon title="Consultations" icon={Stethoscope} />} />
        <Route path="treatment-plans" element={<ComingSoon title="Treatment plans" icon={Sparkles} />} />
        <Route path="pharmacy" element={<ComingSoon title="Pharmacy" icon={Pill} />} />
        <Route path="inventory" element={<ComingSoon title="Inventory" icon={Package} />} />
        <Route path="staff" element={<ComingSoon title="Staff" icon={UserCog} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
