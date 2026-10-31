# Platform admin recovery — planned

Implement independent key revocation, one-time recovery tokens and session invalidation.
Three keys are alternative credentials; any one is accepted alongside admin ID and password.
They are not MFA. Do not implement a permanent master password or public emergency bypass.
The authorized server recovery procedure must work independently of the admin UI and be audited.
