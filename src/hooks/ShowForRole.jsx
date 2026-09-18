import React from "react";
import { useAppSelector } from "../app/hooks";

const ShowForRole = ({ Role = [], children }) => {
  const userRole = useAppSelector(
    (state) => state.auth.data?.userDetails?.user_role || ""
  );

  // Convert single role to array
  const roles = Array.isArray(Role) ? Role : [Role];

  // Show only if user role matches
  if (userRole && roles.includes(userRole)) {
    return <>{children}</>;
  }

  return null;
};

export default ShowForRole;

