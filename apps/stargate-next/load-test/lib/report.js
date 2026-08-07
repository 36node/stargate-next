function metricValue(data, name, key) {
  const metric = data.metrics[name];
  if (!metric || metric.values === undefined) {
    return null;
  }
  const value = metric.values[key];
  return value === undefined ? null : value;
}

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(2)} ms`;
}

function formatRate(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listChecks(data) {
  const rawChecks = data.root_group?.checks ?? [];
  return Array.isArray(rawChecks) ? rawChecks : Object.values(rawChecks);
}

function buildTextSummary(data) {
  const lines = [
    "     ✓ stargate-next tenant-auth summary",
    "",
    `       checks_pass_rate......: ${formatRate(metricValue(data, "checks", "rate"))}`,
    `       http_req_failed......: ${formatRate(metricValue(data, "http_req_failed", "rate"))}`,
    `       iterations...........: ${formatCount(metricValue(data, "iterations", "count"))}`,
    `       vus_max..............: ${formatCount(metricValue(data, "vus_max", "max"))}`,
    `       captcha_duration.p95.: ${formatMs(metricValue(data, "captcha_duration", "p(95)"))}`,
    `       login_duration.p95...: ${formatMs(metricValue(data, "login_duration", "p(95)"))}`,
    `       refresh_duration.p95.: ${formatMs(metricValue(data, "refresh_duration", "p(95)"))}`,
    "",
  ];

  for (const check of listChecks(data)) {
    const passes = check.passes ?? 0;
    const fails = check.fails ?? 0;
    const mark = fails === 0 ? "✓" : "✗";
    lines.push(`     ${mark} ${check.name ?? "check"} (${passes} pass / ${fails} fail)`);
  }

  const thresholds = data.thresholds ?? {};
  const thresholdNames = Object.keys(thresholds);
  if (thresholdNames.length > 0) {
    lines.push("");
    for (const name of thresholdNames) {
      const ok = thresholds[name].ok;
      lines.push(`     ${ok ? "✓" : "✗"} threshold ${name}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildHtml(data, stamp) {
  const durationMs = metricValue(data, "iteration_duration", "avg");
  const checksRate = metricValue(data, "checks", "rate");
  const httpFailed = metricValue(data, "http_req_failed", "rate");
  const loginP95 = metricValue(data, "login_duration", "p(95)");
  const refreshP95 = metricValue(data, "refresh_duration", "p(95)");
  const captchaP95 = metricValue(data, "captcha_duration", "p(95)");
  const vusMax = metricValue(data, "vus_max", "max");
  const iterations = metricValue(data, "iterations", "count");

  const checkRows = listChecks(data).map((check) => {
    const passes = check.passes ?? 0;
    const fails = check.fails ?? 0;
    const total = passes + fails;
    const rate = total === 0 ? 0 : passes / total;
    return `<tr><td>${escapeHtml(check.name ?? "check")}</td><td>${passes}</td><td>${fails}</td><td>${formatRate(rate)}</td></tr>`;
  });

  const thresholdRows = Object.entries(data.thresholds ?? {}).map(
    ([name, result]) => {
      const ok = result.ok ? "pass" : "fail";
      return `<tr><td>${escapeHtml(name)}</td><td class="${ok}">${ok}</td></tr>`;
    }
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>stargate-next load report ${escapeHtml(stamp)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111; background: #fafafa; }
    h1, h2 { margin: 0 0 0.75rem; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; max-width: 52rem; background: #fff; margin-bottom: 1.5rem; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f3f3f3; }
    .pass { color: #0a7a2f; font-weight: 600; }
    .fail { color: #b00020; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; max-width: 52rem; }
    .card { background: #fff; border: 1px solid #ddd; padding: 0.75rem 1rem; }
    .card strong { display: block; font-size: 1.15rem; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <h1>stargate-next tenant-auth load report</h1>
  <p class="meta">Generated ${escapeHtml(stamp)}</p>
  <div class="grid">
    <div class="card">VUs max<strong>${vusMax ?? "—"}</strong></div>
    <div class="card">Iterations<strong>${iterations ?? "—"}</strong></div>
    <div class="card">Checks pass rate<strong>${formatRate(checksRate)}</strong></div>
    <div class="card">HTTP failed<strong>${formatRate(httpFailed)}</strong></div>
    <div class="card">Login p95<strong>${formatMs(loginP95)}</strong></div>
    <div class="card">Refresh p95<strong>${formatMs(refreshP95)}</strong></div>
    <div class="card">Captcha p95<strong>${formatMs(captchaP95)}</strong></div>
    <div class="card">Iter duration avg<strong>${formatMs(durationMs)}</strong></div>
  </div>
  <h2>Checks</h2>
  <table>
    <thead><tr><th>Name</th><th>Passes</th><th>Fails</th><th>Rate</th></tr></thead>
    <tbody>${checkRows.join("") || "<tr><td colspan='4'>No checks</td></tr>"}</tbody>
  </table>
  <h2>Thresholds</h2>
  <table>
    <thead><tr><th>Name</th><th>Result</th></tr></thead>
    <tbody>${thresholdRows.join("") || "<tr><td colspan='2'>No thresholds</td></tr>"}</tbody>
  </table>
</body>
</html>`;
}

function buildMarkdown(data, stamp) {
  const checksRate = metricValue(data, "checks", "rate");
  const httpFailed = metricValue(data, "http_req_failed", "rate");
  const loginP95 = metricValue(data, "login_duration", "p(95)");
  const refreshP95 = metricValue(data, "refresh_duration", "p(95)");
  const captchaP95 = metricValue(data, "captcha_duration", "p(95)");
  const vusMax = metricValue(data, "vus_max", "max");
  const iterations = metricValue(data, "iterations", "count");
  const durationMs = metricValue(data, "iteration_duration", "avg");

  const checkRows = listChecks(data).map((check) => {
    const passes = check.passes ?? 0;
    const fails = check.fails ?? 0;
    const total = passes + fails;
    const rate = total === 0 ? 0 : passes / total;
    const mark = fails === 0 ? "✅" : "❌";
    return `| ${mark} ${check.name ?? "check"} | ${passes} | ${fails} | ${formatRate(rate)} |`;
  });

  const thresholdRows = Object.entries(data.thresholds ?? {}).map(
    ([name, result]) => {
      const mark = result.ok ? "✅" : "❌";
      return `| ${mark} \`${name}\` | ${result.ok ? "pass" : "fail"} |`;
    }
  );

  const lines = [
    `## stargate-next tenant-auth load report`,
    "",
    `Generated \`${stamp}\``,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| VUs max | ${formatCount(vusMax)} |`,
    `| Iterations | ${formatCount(iterations)} |`,
    `| Checks pass rate | ${formatRate(checksRate)} |`,
    `| HTTP failed | ${formatRate(httpFailed)} |`,
    `| Captcha p95 | ${formatMs(captchaP95)} |`,
    `| Login p95 | ${formatMs(loginP95)} |`,
    `| Refresh p95 | ${formatMs(refreshP95)} |`,
    `| Iter duration avg | ${formatMs(durationMs)} |`,
    "",
    "### Checks",
    "",
    "| Check | Passes | Fails | Rate |",
    "| --- | --- | --- | --- |",
    ...(checkRows.length > 0 ? checkRows : ["| — | — | — | — |"]),
    "",
    "### Thresholds",
    "",
    "| Threshold | Result |",
    "| --- | --- |",
    ...(thresholdRows.length > 0 ? thresholdRows : ["| — | — |"]),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

/**
 * Write JSON + HTML + Markdown under load-test/results/ and print a compact terminal summary.
 * Paths are relative to the process cwd (apps/stargate-next when using package scripts).
 */
export function buildSummaryFiles(data) {
  const stamp = new Date().toISOString().replace(/:/g, "-");
  const base = `load-test/results/${stamp}`;
  return {
    stdout: buildTextSummary(data),
    [`${base}-summary.json`]: JSON.stringify(data, null, 2),
    [`${base}-report.html`]: buildHtml(data, stamp),
    [`${base}-summary.md`]: buildMarkdown(data, stamp),
  };
}
