import React from "react";
import { useAppSelector } from "../app/hooks";

const HideForRole = ({ Role = null, children }) => {
  const userRole = useAppSelector(
    (state) => state.auth.data?.userDetails?.user_role
  );

  if (userRole !== Role) {
    return <>{children}</>;
  }

  return null;
};

export default HideForRole;