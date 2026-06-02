type PasswordChangeInput = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function validatePasswordChange(input: PasswordChangeInput) {
  if (!input.oldPassword.trim()) {
    return "Enter your old password.";
  }

  if (!input.newPassword) {
    return "Enter a new password.";
  }

  if (!input.confirmPassword) {
    return "Confirm your new password.";
  }

  if (input.newPassword.length < 10) {
    return "Use at least 10 characters for the new password.";
  }

  if (input.newPassword !== input.confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
}
