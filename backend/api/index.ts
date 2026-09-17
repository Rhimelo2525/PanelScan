// Vercel serverless entry point.
//
// This does not add or change any application behavior - it only adapts the
// existing Express app (backend/src/app.ts) to run as a Vercel serverless
// function. Express apps are valid (req, res) request handlers, so re-exporting
// the app as the function's default export is sufficient; `vercel.json` at the
// backend root rewrites every incoming path to this function so routes that
// live outside `/api` in the Express app (e.g. `/health`, `/uploads/*`) keep
// working unchanged.
import app from '../src/app';

export default app;
