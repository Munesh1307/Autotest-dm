// ================================
// ROLES
// ================================

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  TRAINER: "TRAINER",
  STUDENT: "STUDENT",
};

// ================================
// PERMISSIONS
// ================================

export const PERMISSIONS = {
  // User Management
  MANAGE_USERS: "manage_users",
  APPROVE_USERS: "approve_users",
  ASSIGN_ROLES: "assign_roles",

  // Products
  VIEW_PRODUCTS: "view_products",
  CREATE_PRODUCT: "create_product",
  UPDATE_PRODUCT: "update_product",
  DELETE_PRODUCT: "delete_product",

  // Certificates
  MANAGE_CERTIFICATES: "manage_certificates",

  // Homepage
  MANAGE_HOMEPAGE: "manage_homepage",

  // Gallery
  MANAGE_GALLERY: "manage_gallery",

  // Treatment Results
  MANAGE_TREATMENTS: "manage_treatments",

  // AI Analysis
  VIEW_AI_RECORDS: "view_ai_records",
  VIEW_ASSIGNED_STUDENTS: "view_assigned_students",
  VIEW_OWN_ANALYSIS: "view_own_analysis",

  // Profile
  VIEW_PROFILE: "view_profile",
  UPDATE_PROFILE: "update_profile",

  // Settings
  MANAGE_SETTINGS: "manage_settings",
};