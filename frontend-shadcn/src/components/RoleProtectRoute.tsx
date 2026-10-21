import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { UserTypeEnum } from "@/utils/enum";

interface RoleProtectedRouteProps {
  allowedRoles: UserTypeEnum[];
  children: ReactNode;
}

const RoleProtectedRoute = ({
  allowedRoles,
  children,
}: RoleProtectedRouteProps) => {
  const { user } = useAuth();

  // Se l'utente non ha il ruolo giusto, redirect alla home
  if (!user?.user_type || !allowedRoles.includes(user.user_type)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default RoleProtectedRoute;
