export type EmployeeInvitationActionResult =
  | { ok: true }
  | {
      fieldErrors: {
        confirmPassword?: string;
        email?: string;
        fullName?: string;
        locale?: string;
        password?: string;
        role?: string;
      };
      formError: string | null;
      ok: false;
    };

export const initialEmployeeInvitationState: EmployeeInvitationActionResult = {
  fieldErrors: {},
  formError: null,
  ok: false,
};
