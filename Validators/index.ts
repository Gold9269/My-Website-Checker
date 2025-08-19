// Validators/index.ts (robust bootstrap — minimal changes)
import util from "util";

process.on("uncaughtException", (err: any) => {
  console.error("UNCAUGHT EXCEPTION:");
  console.error(util.inspect(err, { showHidden: true, depth: null }));
  process.exit(1);
});
process.on("unhandledRejection", (reason: any) => {
  console.error("UNHANDLED REJECTION:");
  console.error(util.inspect(reason, { showHidden: true, depth: null }));
  process.exit(1);
});

(async () => {
  try {
    // dynamic import of the implementation module
    const mod = await import("./index_impl.js");

    // runtime-safe access (use 'any' to avoid TS complaining about unknown shape)
    const anyMod = mod as any;

    // 1) prefer named export `main`
    if (typeof anyMod.main === "function") {
      await anyMod.main();
      return;
    }

    // 2) then try default export
    if (typeof anyMod.default === "function") {
      await anyMod.default();
      return;
    }

    // 3) finally, if the module itself is a function (rare), call it
    if (typeof anyMod === "function") {
      await anyMod();
      return;
    }

    console.warn("Bootstrap: no callable export found in index_impl.js (tried main, default, module).");
    process.exit(1);
  } catch (err) {
    console.error("DYNAMIC IMPORT / MODULE EVALUATION ERROR:");
    console.error(util.inspect(err, { showHidden: true, depth: null }));
    process.exit(1);
  }
})();
