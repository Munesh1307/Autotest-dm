export const getNameInitials = (name) => {
  if (!name) return "U";
  return name.trim().charAt(0).toUpperCase();
};
