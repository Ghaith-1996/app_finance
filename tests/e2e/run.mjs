import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inside = process.argv.includes("--inside");
const frontendOnly = process.argv.includes("--frontend");
const owned = `pf-e2e-${randomUUID().slice(0, 12)}`;
const hostEnv = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(hostEnv, { DOCKER_CONTEXT: "default", DO_NOT_TRACK: "1", SUPABASE_TELEMETRY_DISABLED: "1", SUPABASE_EXPERIMENTAL_STACK: "0" });

async function command(bin, args, { env = hostEnv, cwd = root, input, label = bin } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(bin, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let errors = "";
    child.stdout.on("data", (part) => { output += part; });
    child.stderr.on("data", (part) => { errors += part; });
    child.on("error", () => reject(new Error(`${label}: unable to launch`)));
    child.on("close", (code) => {
      if (code === 0) accept(output);
      else reject(Object.assign(new Error(`${label}: exit ${code}`), { privateOutput: output + errors }));
    });
    child.stdin.end(input);
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}

const excludedSourceDirectories = new Set([".git", ".codex", ".agents", ".aws", ".claude", "node_modules", ".next", ".temp", "__pycache__", ".venv", ".pytest_cache", ".ruff_cache", "coverage", "e2e-results", "test-results", "playwright-report", ".edgar_data", ".yfinance_data", ".yfinance_tmp", ".yfinance_local"]);
function excludedSourcePath(path) {
  return path.split("/").some((part) => excludedSourceDirectories.has(part) || part.startsWith(".env")) || /\.(tsbuildinfo|pyc|pem|key)$/.test(path);
}
async function sourceFiles(directory = root, prefix = "") {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (excludedSourcePath(path)) continue;
    if (entry.isDirectory()) paths.push(...await sourceFiles(join(directory, entry.name), `${path}/`));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

async function outsideRun() {
  const keepDiagnostic = process.env.E2E_KEEP_DIAGNOSTIC === "1";
  const temp = await mkdtemp(join(tmpdir(), `${owned}-`));
  const resultDir = resolve(process.env.E2E_RESULTS_DIR ?? join(root, "e2e-results"), owned);
  await mkdir(resultDir, { recursive: true });
  const cli = process.env.E2E_SUPABASE_BIN ?? "supabase";
  const docker = (args, options) => command("docker", args, options);
  const supabase = (args) => command(cli, [...args, "--workdir", temp], { cwd: temp });
  const proof = { namespace: owned, status: "blocked", selection: frontendOnly ? "frontend-polish" : "all", gates: [], migrations: [], qualifiedScenarios: [], executedScenarioFamilies: [], subOracleStatus: "See external L-E2E-sub-oracles.md; an executed family does not qualify every sub-oracle", removedTests: 0 };
  let started = false;
  let network = false;
  let image = false;
  try {
    proof.head = (await command("git", ["rev-parse", "HEAD"])).trim();
    proof.cliVersion = (await command(cli, ["--version"], { cwd: temp })).trim();
    assert.equal(proof.cliVersion, "2.119.0");
    proof.dockerVersion = (await docker(["version", "--format", "{{.Server.Version}}"])).trim();
    const migrations = (await readdir(join(root, "supabase/migrations"))).filter((name) => name.endsWith(".sql")).sort();
    assert.equal(migrations.length, 47, "Review the migration manifest before changing expected count");
    proof.hashes = {};
    for (const path of ["package-lock.json", "requirements.lock", "next.config.ts", ...migrations.map((name) => `supabase/migrations/${name}`)]) proof.hashes[path] = createHash("sha256").update(await readFile(join(root, path))).digest("hex");
    const trackedPaths = (await command("git", ["ls-files", "--cached", "-z"])).split("\0").filter(Boolean);
    const sourcePaths = [...new Set([...trackedPaths, ...await sourceFiles()])].sort();
    proof.sourceManifest = {};
    for (const path of sourcePaths) {
      if (excludedSourcePath(path)) continue;
      try { proof.sourceManifest[path] = createHash("sha256").update(await readFile(join(root, path))).digest("hex"); }
      catch (error) { if (error.code === "ENOENT") proof.sourceManifest[path] = "deleted"; else throw error; }
    }
    proof.patchFingerprint = createHash("sha256").update(JSON.stringify(proof.sourceManifest)).digest("hex");
    console.log("E2E: building dependencies before isolated execution");
    await docker(["buildx", "build", "--load", "--label", `pulsefolio.e2e.owner=${owned}`, "-t", owned, "-f", "tests/e2e/Dockerfile", "."], { label: "dependency image build" });
    image = true;
    proof.image = (await docker(["image", "inspect", owned, "--format", "{{.Id}}"])).trim();
    await mkdir(join(temp, "supabase"));
    let config = await readFile(join(root, "tests/e2e/supabase/config.toml"), "utf8");
    for (const [key, value] of Object.entries({ PROJECT: owned, API_PORT: await freePort(), DB_PORT: await freePort(), SHADOW_PORT: await freePort() })) config = config.replaceAll(`__${key}__`, String(value));
    await writeFile(join(temp, "supabase/config.toml"), config);
    console.log("E2E: starting fresh owned Supabase stack");
    started = true;
    await supabase(["start", "-x", "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]);
    const serviceNames = (await docker(["ps", "--format", "{{.Names}}"])).trim().split("\n").filter((name) => name.startsWith("supabase_") && name.endsWith(`_${owned}`)).sort();
    proof.supabaseImages = [];
    for (const name of serviceNames) {
      const observed = JSON.parse((await docker(["inspect", "--format", '{"name":{{json .Name}},"imageId":{{json .Image}},"imageReference":{{json .Config.Image}}}', name])).trim());
      observed.repoDigests = JSON.parse((await docker(["image", "inspect", "--format", "{{json .RepoDigests}}", observed.imageId])).trim()) ?? [];
      proof.supabaseImages.push(observed);
    }
    const status = JSON.parse(await supabase(["status", "-o", "json"]));
    assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
    const db = `supabase_db_${owned}`;
    for (const name of migrations) {
      await docker(["exec", "-i", db, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: await readFile(join(root, "supabase/migrations", name)), label: `migration ${name}` });
      proof.migrations.push(name);
    }
    await docker(["exec", db, "psql", "-U", "postgres", "-d", "postgres", "-c", "NOTIFY pgrst, 'reload schema'"]);
    proof.gates.push("all-47-migrations-lexical");
    await docker(["network", "create", "--internal", "--label", `pulsefolio.e2e.owner=${owned}`, owned]);
    network = true;
    await docker(["network", "connect", "--alias", "supabase", owned, `supabase_kong_${owned}`]);
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "http://supabase:8000", NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      NEXT_TELEMETRY_DISABLED: "1", E2E_RUN_ID: owned, E2E_LEDGER: "/proof/transport.jsonl",
      E2E_HTTP_FIXTURES: "/tmp/e2e-http.json", PYTHONPATH: "/work/tests/e2e/python:/work",
      STRIPE_SECRET_KEY: "sk_test_e2e_fictitious", STRIPE_WEBHOOK_SECRET: "whsec_e2e_fictitious",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "e2e-fictitious",
      ADMIN_USER_EMAILS: `a-${owned}@example.invalid`, FINNHUB_API_KEY: "e2e-fictitious",
      CRON_SECRET: "e2e-fictitious-cron", DIGEST_CRON_SECRET: "e2e-fictitious-digest",
      TWILIO_ACCOUNT_SID: "ACe2efictitious", TWILIO_AUTH_TOKEN: "e2e-fictitious", TWILIO_MESSAGING_SERVICE_SID: "MGe2efictitious",
      RESEND_API_KEY: "re_e2e_fictitious", RESEND_FROM_EMAIL: "Fixture <fixture@example.invalid>",
      STRIPE_PREMIUM_PRICE_ID: "price_e2e_premium", STRIPE_ULTIMATE_PRICE_ID: "price_e2e_ultimate",
      AI_PROVIDER: "nemotron", OPENROUTER_API_KEY: "sk-or-e2e-fixture", OPENROUTER_MODEL: "stepfun/step-3.5-flash:free",
      OPENROUTER_NEMOTRON_API_KEY: "sk-or-e2e-nemotron",
      OPENAI_API_KEY: "sk-e2e-fixture", ANTHROPIC_API_KEY: "sk-ant-e2e-fixture",
      MISTRAL_API_KEY: "e2e-fixture", MISTRAL_MODEL: "mistral-large-latest",
      AZURE_OPENAI_API_KEY: "e2e-fixture", AZURE_OPENAI_BASE_URL: "https://e2e.openai.azure.com", AZURE_OPENAI_MODEL: "e2e-deployment",
    };
    const envFile = join(temp, "container.env");
    await writeFile(envFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n"), { mode: 0o600 });
    proof.network = { internal: JSON.parse(await docker(["network", "inspect", owned]))[0].Internal, testContainer: `${owned}-tests`, gateway: `supabase_kong_${owned}` };
    assert.equal(proof.network.internal, true);
    console.log("E2E: running transport, authentication and browser gates");
    await docker(["run", ...(keepDiagnostic ? [] : ["--rm"]), "--name", `${owned}-tests`, "--label", `pulsefolio.e2e.owner=${owned}`, "--network", owned, "--env-file", envFile, "--mount", `type=bind,source=${resultDir},target=/proof`, owned, ...(frontendOnly ? ["node", "tests/e2e/run.mjs", "--inside", "--frontend"] : [])], { label: "isolated E2E execution" });
    const assertions = (await readFile(join(resultDir, "assertions.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
    proof.executedScenarioFamilies = [...new Set(assertions.map((row) => row.scenario.match(/^E2E-\d{2}/)?.[0]).filter(Boolean))].sort();
    proof.status = "passed";
  } catch (error) {
    proof.failure = error.message;
    if (error.privateOutput) {
      await writeFile(join(temp, "private-diagnostic.txt"), error.privateOutput, { mode: 0o600 });
      console.error(`E2E: private diagnostic at ${join(temp, "private-diagnostic.txt")}`);
    }
    process.exitCode = 1;
  } finally {
    if (keepDiagnostic) {
      proof.diagnosticOnly = true;
      console.log(`E2E: retained owned diagnostic resources ${owned}; private workdir ${temp}`);
    }
    if (started && !keepDiagnostic) {
      await docker(["rm", "-f", `${owned}-tests`]).catch(() => {});
      await supabase(["stop", "--no-backup"]).catch(() => { proof.cleanupFailure = true; });
    }
    if (network && !keepDiagnostic) await docker(["network", "rm", owned]).catch(() => { proof.cleanupFailure = true; });
    if (image && !keepDiagnostic) await docker(["image", "rm", owned]).catch(() => { proof.cleanupFailure = true; });
    await rm(join(temp, "container.env"), { force: true });
    await writeFile(join(resultDir, "runner.json"), JSON.stringify(proof, null, 2));
    console.log(`E2E: ${proof.status}; sanitized proof ${resultDir}`);
  }
}

async function insideRun() {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://supabase:8000");
  const transportOnly = process.argv.includes("--transport-only");
  const env = { ...process.env, TWELVE_DATA_API_KEY: "e2e-fictitious", NEWSAPI_KEY: "e2e-fictitious", NEWSAPI_AI_API_KEY: "e2e-fictitious", NEWSCATCHER_API_KEY: "e2e-fictitious", EDGAR_IDENTITY: "Local Fixture fixture@example.invalid", E2E_TRANSPORT_ONLY: transportOnly ? "1" : "0", NODE_OPTIONS: "--import=/work/tests/e2e/external-http.mjs" };
  const yahooResult = { quotes: [{ symbol: "AAA", shortname: "Fixture Alpha", exchange: "NMS", quoteType: "EQUITY", typeDisp: "equity", score: 1, index: "quotes", isYahooFinance: true }], news: [], nav: [], lists: [], explains: [], researchReports: [], screenerFieldResults: [], totalTime: 1, timeTakenForQuotes: 1, timeTakenForNews: 1, timeTakenForAlgowatchlist: 1, timeTakenForPredefinedScreener: 1, timeTakenForCrunchbase: 1, timeTakenForNav: 1, timeTakenForResearchReports: 1, timeTakenForScreenerField: 1, timeTakenForCulturalAssets: 1, timeTakenForSearchLists: 1, count: 1 };
  await writeFile(process.env.E2E_HTTP_FIXTURES, JSON.stringify({ scenario: "foundation", responses: [
    { origin: "https://transport.e2e.invalid", method: "GET", path: "/canary", body: { ok: true } },
    { origin: "https://api.stripe.com", method: "GET", path: "/v1/customers/cus_e2e", body: { id: "cus_e2e", object: "customer" } },
    { origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v1/finance/search", body: yahooResult },
  ] }));
  await command(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import Stripe from 'stripe';
    import YahooFinance from 'yahoo-finance2';
    assert.equal((await (await fetch('https://transport.e2e.invalid/canary')).json()).ok, true);
    assert.equal((await new Stripe('sk_test_e2e_fictitious').customers.retrieve('cus_e2e')).id, 'cus_e2e');
    const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    assert.equal((await yahoo.search('AAA')).quotes[0].symbol, 'AAA');
    await assert.rejects(fetch('https://unknown.e2e.invalid/refuse'));
    if (process.env.E2E_TRANSPORT_ONLY !== '1') assert.equal((await fetch('http://supabase:8000/auth/v1/health', {headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}})).status, 200);
  `], { env, label: "Node fetch/Stripe/Yahoo/passthrough gate" });
  const python = `
import asyncio, json, os, subprocess, sys, urllib.request
import requests, httpx
url = 'https://transport.e2e.invalid/canary'
assert requests.get(url).json()['ok']
assert httpx.get(url).json()['ok']
assert json.load(urllib.request.urlopen(url))['ok']
async def check():
    async with httpx.AsyncClient() as client:
        assert (await client.get(url)).json()['ok']
asyncio.run(check())
try:
    requests.get('https://unknown.e2e.invalid/refuse')
    raise AssertionError('unknown external HTTP passed')
except OSError:
    pass
if os.environ.get('E2E_TRANSPORT_ONLY') != '1':
    assert requests.get('http://supabase:8000/auth/v1/health', headers={'apikey':os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']}).status_code == 200
`;
  await command("python", ["-c", python + `\nsubprocess.run([sys.executable, '-c', ${JSON.stringify(python)}], check=True)\n`], { env, label: "Python requests/httpx/urllib/child gate" });
  const { chromium } = await import("@playwright/test");
  const chromiumVersion = (await command(chromium.executablePath(), ["--version"], { env, label: "observed Chromium version" })).trim();
  await writeFile("/proof/gates.json", JSON.stringify({ node: process.version, python: (await command("python", ["--version"], { env })).trim(), chromium: chromiumVersion, versionSource: "executed binaries; locked package versions are separately hashed in runner.json", transport: ["node-fetch", "stripe-sdk", "yahoo-sdk", "python-requests", "python-httpx", "python-async-httpx", "python-urllib", "python-child"], authHealth: !transportOnly, unknownHttpRefused: true, scenariosQualified: false }, null, 2));
  if (transportOnly) return;
  if (!process.argv.includes("--reuse-build")) await command(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, label: "production Next build" });
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"], { env, stdio: "ignore" });
  try {
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try { ready = (await fetch("http://127.0.0.1:3000/login")).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise((accept) => setTimeout(accept, 1000));
    }
    assert.ok(ready, "Next production server did not become ready");
    await command(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "session-import", "--grep", "foundation:"], { env, label: "browser foundation gate" });
    if (frontendOnly) {
      await command(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "frontend-polish"], { env, label: "browser frontend polish scenarios" });
    } else {
      await command(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "session-import", "--grep-invert", "foundation:"], { env, label: "browser session/import scenarios" });
      await command(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "portfolio-feed|chat-thesis-community|billing-notifications|news-workers|frontend-polish|ai-provider-routing"], { env, label: "browser remaining scenarios" });
    }
  } finally { next.kill("SIGTERM"); }
}

// Sanitized pointer to a failing browser test for the exported proof: Playwright test titles and
// spec source positions only, never assertion values, page content, headers or credentials.
function failureLocation(output = "") {
  const tests = [...output.matchAll(/^\s*\d+\) (?:\[[^\]]+\] › )?((?:[\w.-]+\/)*[\w.-]+\.spec\.ts:\d+:\d+) › (.+?)[\s─]*$/gm)]
    .map((match) => `${match[1]} › ${match[2]}`);
  // Stack-trace frames only: the reporter's progress lines also name every passing test's position.
  const positions = [...output.matchAll(/^\s*at .*?tests\/e2e\/([\w.-]+\.spec\.ts:\d+:\d+)/gm)].map((match) => match[1]);
  // Error category from a fixed vocabulary; matcher arguments and received values are dropped.
  const errors = [...output.matchAll(/^\s*Error: (.+)$/gm)].map(([, line]) => {
    if (/strict mode violation/.test(line)) return `strict mode violation (${line.match(/resolved to (\d+) elements/)?.[1] ?? "?"} elements)`;
    if (/Test timeout of \d+ms exceeded/.test(line)) return "test timeout";
    return line.match(/^expect\((?:locator|page|received)\)\.\w+\((?:expected)?\)/)?.[0] ?? "other";
  });
  const received = [...output.matchAll(/^\s*Received(?: string)?: (<element\(s\) not found>|hidden|visible)\s*$/gm)].map((match) => match[1]);
  return {
    tests: [...new Set(tests)],
    positions: [...new Set(positions)].slice(0, 10),
    errors: [...new Set(errors)].slice(0, 5),
    received: [...new Set(received)],
  };
}

try { await (inside ? insideRun() : outsideRun()); }
catch (error) {
  if (inside) await writeFile("/proof/failure.json", JSON.stringify({ stage: error.message, ...failureLocation(error.privateOutput) }));
  console.error(error.message);
  // Captured only into runner-owned private TEMP, never the exported proof directory.
  if (error.privateOutput) console.error(error.privateOutput);
  process.exitCode = 1;
}
