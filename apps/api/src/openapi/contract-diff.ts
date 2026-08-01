import type { ContractMismatch, DocumentedOperation, ImplementedRoute } from "./contract-types";

function isParamSegment(segment: string): boolean {
  return segment.startsWith("{") && segment.endsWith("}");
}

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/** Same shape, ignoring parameter names: `/a/{id}` matches `/a/{mediaId}`. */
function sameShape(a: string, b: string): boolean {
  const aSegments = segmentsOf(a);
  const bSegments = segmentsOf(b);
  if (aSegments.length !== bSegments.length) return false;
  return aSegments.every((segment, index) =>
    isParamSegment(segment) && isParamSegment(bSegments[index]) ? true : segment === bSegments[index],
  );
}

function checkPair(
  route: ImplementedRoute,
  operation: DocumentedOperation,
  mismatches: ContractMismatch[],
): void {
  const where = `${route.method} ${route.path} (${route.controller}.${route.handler})`;
  if (!route.isPublic && !operation.hasSecurity) {
    mismatches.push({
      kind: "missing_security",
      method: route.method,
      path: route.path,
      detail: `${where} requires auth (no @Public) but the OpenAPI operation declares no security`,
    });
  }
  if (route.isPublic && operation.hasSecurity) {
    mismatches.push({
      kind: "unexpected_security",
      method: route.method,
      path: route.path,
      detail: `${where} is @Public but the OpenAPI operation declares security`,
    });
  }
  if (route.hasBody && !operation.hasRequestBody) {
    mismatches.push({
      kind: "missing_request_body",
      method: route.method,
      path: route.path,
      detail: `${where} declares a @Body parameter but the OpenAPI operation has no requestBody`,
    });
  }
  if (!operation.responseStatuses.includes(route.successStatus)) {
    mismatches.push({
      kind: "missing_success_status",
      method: route.method,
      path: route.path,
      detail: `${where} returns ${route.successStatus} but OpenAPI documents [${operation.responseStatuses.join(", ")}]`,
    });
  }
}

/**
 * Compares implemented controller routes against documented OpenAPI operations.
 * Both sides must already live in the same path space (global prefix stripped).
 * Returns every mismatch found; an empty array means the contract holds.
 */
export function diffContract(
  routes: ImplementedRoute[],
  operations: DocumentedOperation[],
): ContractMismatch[] {
  const mismatches: ContractMismatch[] = [];

  // Spec-internal: every {param} in a documented path must be declared `in: path`.
  for (const operation of operations) {
    for (const param of operation.pathParams) {
      if (!operation.declaredPathParams.includes(param)) {
        mismatches.push({
          kind: "undeclared_path_param",
          method: operation.method,
          path: operation.path,
          detail: `{${param}} appears in the path template but is not declared as a path parameter`,
        });
      }
    }
  }

  const unmatchedOperations = new Set(operations);

  for (const route of routes) {
    const exact = operations.find((op) => op.path === route.path && op.method === route.method);
    if (exact) {
      unmatchedOperations.delete(exact);
      checkPair(route, exact, mismatches);
      continue;
    }
    const samePathOps = operations.filter((op) => op.path === route.path);
    if (samePathOps.length > 0) {
      mismatches.push({
        kind: "method_mismatch",
        method: route.method,
        path: route.path,
        detail: `${route.controller}.${route.handler} implements ${route.method} but OpenAPI documents only [${samePathOps
          .map((op) => op.method)
          .join(", ")}] for this path`,
      });
      continue;
    }
    const renamed = operations.find((op) => op.method === route.method && sameShape(op.path, route.path));
    if (renamed) {
      unmatchedOperations.delete(renamed);
      mismatches.push({
        kind: "path_param_mismatch",
        method: route.method,
        path: route.path,
        detail: `implemented as ${route.path} (${route.controller}.${route.handler}) but documented as ${renamed.path}`,
      });
      continue;
    }
    mismatches.push({
      kind: "undocumented_route",
      method: route.method,
      path: route.path,
      detail: `${route.controller}.${route.handler} is implemented but missing from OpenAPI`,
    });
  }

  for (const operation of unmatchedOperations) {
    const samePathRoutes = routes.filter((route) => route.path === operation.path);
    if (samePathRoutes.length > 0) {
      mismatches.push({
        kind: "method_mismatch",
        method: operation.method,
        path: operation.path,
        detail: `OpenAPI documents ${operation.method} (${operation.operationId ?? "no operationId"}) but the controller implements only [${samePathRoutes
          .map((route) => route.method)
          .join(", ")}] for this path`,
      });
    } else {
      mismatches.push({
        kind: "documented_but_missing",
        method: operation.method,
        path: operation.path,
        detail: `documented in OpenAPI (${operation.operationId ?? "no operationId"}) but no controller implements it`,
      });
    }
  }

  return mismatches.sort((a, b) =>
    `${a.path} ${a.method} ${a.kind}`.localeCompare(`${b.path} ${b.method} ${b.kind}`),
  );
}

/** Renders mismatches as a numbered, actionable list for test failure output. */
export function formatMismatches(mismatches: ContractMismatch[]): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map((mismatch, index) => `${index + 1}. [${mismatch.kind}] ${mismatch.method} ${mismatch.path} — ${mismatch.detail}`)
    .join("\n");
}
