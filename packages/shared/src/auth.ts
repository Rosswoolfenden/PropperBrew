/** The shortest password we accept (the auth service is set to the same). */
export const MIN_PASSWORD = 8;

/** Plain words for the auth service's errors. */
export function authMessage(error: { code?: string; message: string }) {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match an account.";
    case "user_already_exists":
    case "email_exists":
      return "There's already an account with that email. Sign in instead.";
    case "email_not_confirmed":
      return "Confirm your email first: we sent you a link when you signed up.";
    case "weak_password":
      return `Use at least ${MIN_PASSWORD} characters for your password.`;
    case "same_password":
      return "That's your current password. Choose a new one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute, then try again.";
    case "email_address_invalid":
    case "validation_failed":
      return "Enter a valid email address.";
    default:
      return error.message;
  }
}
