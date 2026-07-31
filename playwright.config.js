import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Piece Z (batch overnight post-5r): sólo corre el spec de regresión
    // de reflow del panel de pedir, no toda la suite — confirmar el
    // comportamiento cross-browser de esa pieza puntual sin duplicar el
    // tiempo/flakiness de las otras ~15 specs en un segundo motor.
    {
      name: "firefox-reflow",
      use: { ...devices["Desktop Firefox"] },
      testMatch: /online-panel-reflow\.spec\.js/,
    },
  ],
});
