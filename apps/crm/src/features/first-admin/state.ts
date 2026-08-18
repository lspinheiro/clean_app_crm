import type { FirstAdminAcceptanceFieldErrors } from "./schema";

export type FirstAdminState = {
  fieldErrors: FirstAdminAcceptanceFieldErrors;
  formError: string | null;
};

export const initialFirstAdminState: FirstAdminState = {
  fieldErrors: {},
  formError: null,
};
