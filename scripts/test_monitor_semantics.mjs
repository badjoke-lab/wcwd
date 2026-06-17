import worker from "../src/index.js";

console.log(typeof worker.fetch === "function" ? "Monitor semantics test loaded." : "Monitor semantics test failed.");
