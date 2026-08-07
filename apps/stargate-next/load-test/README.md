# stargate-next load tests (k6)

Isolated load scenarios for a running Stargate Next service. These are **not** part of `pnpm test` / Vitest.

## Scenario: `tenant-auth`

1. **setup (once):** Admin API Key creates a tenant and a Tenant API Key, then creates `PREP_USER_COUNT` users and resets each password.
2. **VUs:** Concurrent captcha → login → refresh against those users under the same tenant.

## Prerequisites

1. Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) locally (binary tool; not managed by pnpm).
2. Run Stargate Next against an isolated DB/Redis with test captcha enabled:

```bash
CAPTCHA_TEST_MODE=true
CAPTCHA_TEST_CODE=ABCD   # 4-char alphanumeric; must match what you pass to k6
```

3. Export the same env vars used by black-box tests (or pass `-e`):

| Variable | Required | Default |
|----------|----------|---------|
| `STARGATE_ENDPOINT` | yes | — |
| `STARGATE_ADMIN_API_KEY` | yes | — |
| `CAPTCHA_TEST_CODE` | yes | — |
| `K6_PROFILE` | no | `ramp` (`smoke` = 2 VU / 30s; `ci` = climb to 100 / ~5m) |
| `PREP_USER_COUNT` | no | `1000` (`5` for smoke, `120` for ci) |
| `STEP_THINK_TIME_MIN` / `STEP_THINK_TIME_MAX` | no | `1` / `3` seconds between captcha/login/refresh |
| `THINK_TIME_MIN` / `THINK_TIME_MAX` | no | `5` / `15` seconds after refresh, before next cycle |
| `K6_VUS` / `K6_DURATION` | no | only used by `smoke` profile |

Example from the app directory:

```bash
set -a && source ../../.env && set +a
export CAPTCHA_TEST_CODE=ABCD
```

## Run

From `apps/stargate-next`:

```bash
# Default ramp: fast climb to 800 VUs, hold 4m, fast down (~10m load); 1000 prep users
pnpm test:load

# Smoke: 2 VUs, 5 prep users, 30s
pnpm test:load:smoke

# CI profile: climb to 100 VUs (~5m), 120 prep users
pnpm test:load:ci
```

GitHub: 使用独立 workflow [`.github/workflows/load-test.yml`](../../../.github/workflows/load-test.yml)（仅手动触发），**不**挂在 PR CI 上。

Override prep size / think time:

```bash
PREP_USER_COUNT=1200 THINK_TIME_MIN=5 THINK_TIME_MAX=15 pnpm test:load
```

### Default ramp stages

| Stage | Duration | Target VUs |
|-------|----------|------------|
| climb | 1m | 100 |
| climb | 2m | 400 |
| climb | 2m | 800 |
| hold | 3m | 800 |
| ramp-down | 2m | 0 |
## Reports

Each run prints the usual k6 terminal summary and writes:

```text
load-test/results/<timestamp>-summary.json
load-test/results/<timestamp>-summary.md
load-test/results/<timestamp>-report.html
```

Open the HTML file in a browser for a richer view. On GitHub Actions, the Markdown summary is also written to the run **Summary** tab. Result files are gitignored.

## Notes

- **Captcha rate limit:** default `CAPTCHA_CREATE_LIMIT=30` per IP per window. Each VU uses a distinct `X-Forwarded-For` so concurrent logins do not collide on the same bucket.
- **Data growth:** every run creates one new tenant and `PREP_USER_COUNT` accounts. There is no teardown—use an isolated database.
- **Account isolation:** VUs round-robin users via `(__VU - 1 + __ITER) % users.length` to reduce same-account session contention.
- **Editor:** this folder is excluded from Biome (k6 globals/modules are not Node). Open files under `load-test/` use the local `jsconfig.json` + `@types/k6` so Cursor/VS Code understands `__ENV`, `__VU`, and `import "k6"`.
