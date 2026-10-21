import { EmailService, EmailType } from "./email";
import type { EmailPayloadMap } from "./email";

// The provider is now resolved lazily per send (see EmailService.getContext), so it can
// reflect admin-edited settings without a process restart.
const emailService = new EmailService();

export { emailService, EmailType, EmailPayloadMap };
