import { test } from "node:test";
import assert from "node:assert/strict";
import { requiredApiPermission } from "./api-permissions";

test("private modules separate read and write rights including exports and actions", () => {
  const cases = [
    ["GET", "/api/calendar/events", "calendar.read"],
    ["GET", "/api/calendar/export", "calendar.read"],
    ["PATCH", "/api/calendar/events/test", "calendar.write"],
    ["POST", "/api/calendar/bfv-import/run", "bfv.write"],
    ["GET", "/api/calendar/field-mappings", "bfv.read"],
    ["GET", "/api/admin/event-requests", "requests.read"],
    ["POST", "/api/admin/event-requests/test/approve", "requests.write"],
    ["GET", "/api/orders/export/test", "orders.read"],
    ["DELETE", "/api/orders/test", "orders.write"],
    ["PATCH", "/api/products/test", "shop.write"],
    ["POST", "/api/images/upload", "shop.write"],
    ["GET", "/api/admin/festivals/test/full", "festivals.read"],
    ["DELETE", "/api/admin/festival-signups/test", "festivals.write"],
    ["PUT", "/api/admin/organization/password", "organization.manage"],
    ["PATCH", "/api/admin/users/test", "users.manage"],
    ["DELETE", "/API/Products/test/", "shop.write"],
    ["GET", "/Api/Orders/Export/test/", "orders.read"],
    ["GET", "/API/ADMIN/FESTIVAL-SIGNUPS/test/", "festivals.read"],
  ];
  for (const [method, path, permission] of cases) assert.equal(requiredApiPermission(method, path), permission, `${method} ${path}`);
});

test("public forms and organization password access need no personal account", () => {
  for (const [method, path] of [
    ["GET", "/api/products"], ["GET", "/api/campaigns/active"],
    ["POST", "/api/campaigns/test/verify-password"], ["POST", "/api/orders"],
    ["GET", "/api/festivals/test"], ["POST", "/api/festivals/test/signups"],
    ["POST", "/api/public/event-requests"], ["POST", "/api/organization/login"],
    ["PUT", "/api/organization/chart"],
  ]) assert.equal(requiredApiPermission(method, path), null, `${method} ${path}`);
});
