// Run all automation rules once from the command line (for system cron):
//   pnpm automations
// It imports the same rule registry the app uses.
import { RULES, ruleStates } from "../src/server/automations/rules";
import { runAutomations } from "../src/server/automations/run";
import { db } from "../src/lib/db";
import { syncAllSheets } from "../src/server/sheets/run";

async function main() {
  void RULES;
  void ruleStates;
  const sheets = await syncAllSheets("cli");
  console.log(JSON.stringify(sheets, null, 2));
  const r = await runAutomations("cli");
  console.log(JSON.stringify(r.result, null, 2));
  if (r.errors.length) {
    console.error(r.errors.join("\n"));
    process.exitCode = 1;
  }
}

main().finally(() => db.$disconnect());
