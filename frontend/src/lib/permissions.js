// Centralised permission catalog. Must stay in sync with backend
// ALL_PERMISSION_KEYS and DEFAULT_USER_PERMISSIONS.

// Every nav key that can be granted / revoked.
export const ALL_PERMISSION_KEYS = [
  "dashboard", "orders", "dispatch", "purchaseCenter", "dispatchLedger", "vendorLedger", "dailyReport",
  "estimates",
  "customers", "products", "rawMaterials", "suppliers",
  "priceLists", "vendorPriceLists",
  "adminUsers", "adminSettings", "loginAudit",
];

// Default allowlist for non-admin users when `permissions` is unset (null).
export const DEFAULT_USER_PERMISSIONS = [
  "dashboard", "orders", "dispatch", "dispatchLedger", "dailyReport",
  "estimates",
  "customers", "products",
];

// Friendly labels for the Manage-access dialog.
export const PERMISSION_LABELS = {
  dashboard: "Dashboard",
  orders: "Orders",
  dispatch: "Dispatch Center",
  dispatchLedger: "Customer Ledger",
  vendorLedger: "Vendor Ledger",
  dailyReport: "Dispatch Report",
  estimates: "Estimates",
  purchaseCenter: "Purchase Center",
  customers: "Customers (Party Directory)",
  products: "Products",
  rawMaterials: "Raw Materials",
  suppliers: "Vendors (master)",
  priceLists: "Customer Price Lists",
  vendorPriceLists: "Vendor Price Lists",
  adminUsers: "Users (admin)",
  adminSettings: "Workflow Rules (admin)",
  loginAudit: "Login Audit (admin)",
};

// Resolve a user's effective set of allowed keys.
// - admin role  → null  (means "all"; callers should treat as a wildcard)
// - permissions field is an array → that exact set
// - otherwise → DEFAULT_USER_PERMISSIONS
export function effectivePermissions(user) {
  if (!user) return [];
  if (user.role === "admin") return null;
  if (Array.isArray(user.permissions)) return user.permissions;
  return DEFAULT_USER_PERMISSIONS;
}

// True if the user can access the given nav key.
export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const perms = effectivePermissions(user);
  return Array.isArray(perms) && perms.includes(key);
}
