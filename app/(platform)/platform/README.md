# Platform admin route — planned

Future URL: `/platform`. This folder deliberately contains no page or route handler yet.
Build subscriber/outlet management, subscription controls, audit history and recovery UI here.
Require platform-admin authorization on every server operation. An admin ID, password and any ONE of three independently revocable access keys are required. Keys must be hashed, never committed or logged.
