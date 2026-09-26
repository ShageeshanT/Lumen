import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { HealthLine } from "@/components/health-line";

const HEALTH_URL = "http://localhost:4000/v1/health";
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const healthy = { status: "ok", version: "0.0.0-test", db: "ok", uptime_s: 42 };

describe("HealthLine", () => {
  it("shows the loading state first", () => {
    server.use(
      http.get(HEALTH_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json(healthy);
      }),
    );
    render(<HealthLine />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking API…");
  });

  it("shows ok when the API and database are healthy", async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.json(healthy)));
    render(<HealthLine />);
    expect(await screen.findByText("API: ok · db: ok · up 42s")).toBeInTheDocument();
  });

  it("shows degraded when the database is unavailable", async () => {
    server.use(
      http.get(HEALTH_URL, () =>
        HttpResponse.json({ ...healthy, status: "degraded", db: "unavailable" }, { status: 503 }),
      ),
    );
    render(<HealthLine />);
    expect(await screen.findByText("API: ok · db: unavailable · up 42s")).toBeInTheDocument();
  });

  it("shows unreachable when the request fails", async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.error()));
    render(<HealthLine />);
    expect(await screen.findByText("API unreachable at http://localhost:4000")).toBeInTheDocument();
  });

  it("treats an unexpected body as unreachable", async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.json({ hello: "world" })));
    render(<HealthLine />);
    expect(await screen.findByText(/API unreachable/)).toBeInTheDocument();
  });
});
