export type EmployeeManagementActionResult =
  | { ok: true }
  | { formError: string; ok: false };
