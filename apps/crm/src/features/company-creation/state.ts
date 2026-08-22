import type {
  CompanyCreationFieldErrors,
  CompanyCreationInput,
} from "./schema";

export type CompanyCreationState = {
  fieldErrors: CompanyCreationFieldErrors;
  formError: string | null;
  values: CompanyCreationInput;
};

export const initialCompanyCreationState: CompanyCreationState = {
  fieldErrors: {},
  formError: null,
  values: { abn: "", companyName: "" },
};
