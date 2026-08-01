import { join } from "node:path";
import { diffContract, formatMismatches } from "./contract-diff";
import type { ContractMismatch, DocumentedOperation, ImplementedRoute } from "./contract-types";
import {
  collectImplementedRoutes,
  normalizeRoutePath,
  readGlobalPrefix,
  stripRoutePrefix,
} from "./controller-routes";
import { loadOpenApiOperations, loadOpenApiServerUrls } from "./openapi-document";

const SRC_DIR = join(__dirname, "..");
const MAIN_TS = join(SRC_DIR, "main.ts");
const OPENAPI_YAML = join(__dirname, "..", "..", "..", "..", "docs", "openapi.yaml");

function makeRoute(overrides: Partial<ImplementedRoute>): ImplementedRoute {
  return {
    method: "GET",
    path: "/items",
    controller: "FakeController",
    handler: "list",
    isPublic: false,
    hasBody: false,
    successStatus: 200,
    ...overrides,
  };
}

function makeOperation(overrides: Partial<DocumentedOperation>): DocumentedOperation {
  return {
    method: "GET",
    path: "/items",
    operationId: "listItems",
    hasSecurity: true,
    hasRequestBody: false,
    pathParams: [],
    declaredPathParams: [],
    responseStatuses: [200],
    ...overrides,
  };
}

function kinds(mismatches: ContractMismatch[]): string[] {
  return mismatches.map((mismatch) => mismatch.kind);
}

describe("OpenAPI contract guard", () => {
  describe("route extraction", () => {
    it("reads the global prefix from main.ts", () => {
      expect(readGlobalPrefix(MAIN_TS)).toBe("v1");
    });

    it("normalizes Nest params to OpenAPI template params", () => {
      expect(normalizeRoutePath("v1", "media", ":mediaId")).toBe("/v1/media/{mediaId}");
      expect(normalizeRoutePath("v1", "health")).toBe("/v1/health");
      expect(normalizeRoutePath("v1", "admin", "geo-blocks/:countryCode")).toBe(
        "/v1/admin/geo-blocks/{countryCode}",
      );
      expect(stripRoutePrefix("/v1/auth/login", "v1")).toBe("/auth/login");
    });

    it("pins known routes with auth, body, and status metadata", () => {
      const routes = collectImplementedRoutes(SRC_DIR, "v1");
      const byKey = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));
      expect(routes.length).toBeGreaterThan(70);
      expect(byKey.get("POST /v1/auth/register")).toMatchObject({
        isPublic: true,
        hasBody: true,
        successStatus: 201,
      });
      expect(byKey.get("POST /v1/auth/login")).toMatchObject({ isPublic: true, hasBody: true });
      expect(byKey.get("POST /v1/auth/logout")).toMatchObject({ isPublic: true, successStatus: 200 });
      expect(byKey.get("GET /v1/auth/me")).toMatchObject({
        isPublic: false,
        hasBody: false,
        successStatus: 200,
      });
      expect(byKey.get("GET /v1/health")).toMatchObject({ isPublic: true });
      expect(byKey.get("POST /v1/webhooks/billing/{processorId}")).toMatchObject({ isPublic: true });
      expect(byKey.get("DELETE /v1/admin/geo-blocks/{countryCode}")).toMatchObject({
        isPublic: false,
      });
    });
  });

  describe("spec parsing", () => {
    it("parses every documented operation", () => {
      const operations = loadOpenApiOperations(OPENAPI_YAML);
      expect(operations.length).toBeGreaterThan(70);
      const me = operations.find((op) => op.method === "GET" && op.path === "/auth/me");
      expect(me).toMatchObject({ hasSecurity: true, responseStatuses: expect.arrayContaining([200]) });
    });

    it("declares server URLs that carry the global prefix", () => {
      const prefix = readGlobalPrefix(MAIN_TS);
      const urls = loadOpenApiServerUrls(OPENAPI_YAML);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(new URL(url).pathname.replace(/\/$/, "")).toBe(`/${prefix}`);
      }
    });
  });

  describe("implementation vs documentation", () => {
    it("has zero contract drift", () => {
      const prefix = readGlobalPrefix(MAIN_TS);
      const routes = collectImplementedRoutes(SRC_DIR, prefix).map((route) => ({
        ...route,
        path: stripRoutePrefix(route.path, prefix),
      }));
      const operations = loadOpenApiOperations(OPENAPI_YAML);
      const mismatches = diffContract(routes, operations);
      expect(formatMismatches(mismatches)).toBe("");
    });
  });

  describe("drift detection (negative fixtures)", () => {
    it("flags an implemented route missing from the spec", () => {
      const mismatches = diffContract([makeRoute({ path: "/secret" })], []);
      expect(kinds(mismatches)).toEqual(["undocumented_route"]);
    });

    it("flags a documented route with no implementation", () => {
      const mismatches = diffContract([], [makeOperation({ path: "/ghost" })]);
      expect(kinds(mismatches)).toEqual(["documented_but_missing"]);
    });

    it("flags a method mismatch on a shared path", () => {
      const mismatches = diffContract(
        [makeRoute({ method: "POST", successStatus: 201 })],
        [makeOperation({})],
      );
      expect(kinds(mismatches)).toEqual(["method_mismatch", "method_mismatch"]);
    });

    it("flags a renamed path parameter", () => {
      const mismatches = diffContract(
        [makeRoute({ path: "/items/{id}" })],
        [makeOperation({ path: "/items/{itemId}", pathParams: ["itemId"], declaredPathParams: ["itemId"] })],
      );
      expect(kinds(mismatches)).toEqual(["path_param_mismatch"]);
    });

    it("flags missing security on a protected route", () => {
      const mismatches = diffContract(
        [makeRoute({ isPublic: false })],
        [makeOperation({ hasSecurity: false })],
      );
      expect(kinds(mismatches)).toEqual(["missing_security"]);
    });

    it("flags security declared on a public route", () => {
      const mismatches = diffContract(
        [makeRoute({ isPublic: true })],
        [makeOperation({ hasSecurity: true })],
      );
      expect(kinds(mismatches)).toEqual(["unexpected_security"]);
    });

    it("flags a missing request body", () => {
      const mismatches = diffContract(
        [makeRoute({ method: "POST", hasBody: true, successStatus: 201 })],
        [makeOperation({ method: "POST", hasRequestBody: false, responseStatuses: [201] })],
      );
      expect(kinds(mismatches)).toEqual(["missing_request_body"]);
    });

    it("flags a missing success status", () => {
      const mismatches = diffContract(
        [makeRoute({ method: "POST", successStatus: 201 })],
        [makeOperation({ method: "POST", responseStatuses: [200] })],
      );
      expect(kinds(mismatches)).toEqual(["missing_success_status"]);
    });

    it("flags an undeclared path parameter", () => {
      const mismatches = diffContract(
        [makeRoute({ path: "/items/{id}" })],
        [makeOperation({ path: "/items/{id}", pathParams: ["id"], declaredPathParams: [] })],
      );
      expect(kinds(mismatches)).toEqual(["undeclared_path_param"]);
    });

    it("accepts a fully matched pair", () => {
      expect(diffContract([makeRoute({})], [makeOperation({})])).toEqual([]);
    });
  });
});
