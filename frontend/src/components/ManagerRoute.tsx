import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function ManagerRoute() {
  const { user } = useAuth();
  return user?.organizationRole === "owner" || user?.organizationRole === "admin"
    ? <Outlet />
    : <Navigate to="/" replace />;
}
