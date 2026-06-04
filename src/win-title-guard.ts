// Side-effect-only module. MUST be the FIRST import in every entry point
// (`setup.ts`, `save-cache.ts`), ahead of any `@actions/*` import.
//
// On Windows, libuv < 1.52.1 aborts the process when `uv_get_process_title`
// runs while the console title is empty (see `guardWindowsProcessTitle` in
// `constants.ts` for the full mechanism). The first such read can fire during
// MODULE EVALUATION of a bundled dependency — i.e. before any entry-point
// `run()` body executes. Setting a non-empty title from inside `run()` is
// therefore too late: the import graph has already run and may already have
// aborted. This was observed on `windows-11-arm`, where the post step's console
// title is empty: the in-`run()` guard never got a chance to fire.
//
// Importing this module first makes the guard the earliest user code to
// execute, before every other import's side effects, so libuv's title cache is
// populated (via a succeeding `SetConsoleTitleW`) before anything reads it.
import { guardWindowsProcessTitle } from "./constants.js";

guardWindowsProcessTitle();
