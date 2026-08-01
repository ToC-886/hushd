import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { DocumentedOperation } from "./contract-types";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

interface OpenApiParameter {
  name?: string;
  in?: string;
  $ref?: string;
}

interface OpenApiOperation {
  operationId?: string;
  security?: unknown[];
  requestBody?: unknown;
  parameters?: OpenApiParameter[];
  responses?: Record<string, unknown>;
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[];
  [key: string]: unknown;
}

interface OpenApiDocument {
  paths?: Record<string, OpenApiPathItem>;
  servers?: Array<{ url?: string }>;
  components?: { parameters?: Record<string, OpenApiParameter> };
}

/** Extracts `{param}` names from an OpenAPI path template. */
export function extractPathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function parseDocument(specPath: string): OpenApiDocument {
  return parse(readFileSync(specPath, "utf8")) as OpenApiDocument;
}

/** Resolves local `#/components/parameters/*` refs; anything else is returned as-is. */
function resolveParameter(
  param: OpenApiParameter,
  components: Record<string, OpenApiParameter>,
): OpenApiParameter {
  const prefix = "#/components/parameters/";
  if (typeof param.$ref === "string" && param.$ref.startsWith(prefix)) {
    return components[param.$ref.slice(prefix.length)] ?? param;
  }
  return param;
}

/** Parses the OpenAPI file into a flat, deterministically ordered operation list. */
export function loadOpenApiOperations(specPath: string): DocumentedOperation[] {
  const document = parseDocument(specPath);
  const paths = document.paths ?? {};
  const componentParams = document.components?.parameters ?? {};
  const operations: DocumentedOperation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    const sharedParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OpenApiOperation | undefined;
      if (!operation || typeof operation !== "object") continue;
      const operationParams = Array.isArray(operation.parameters) ? operation.parameters : [];
      const declaredPathParams = [...sharedParams, ...operationParams]
        .map((param) => resolveParameter(param, componentParams))
        .filter((param) => param.in === "path" && typeof param.name === "string")
        .map((param) => param.name as string);
      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: typeof operation.operationId === "string" ? operation.operationId : null,
        hasSecurity: Array.isArray(operation.security) && operation.security.length > 0,
        hasRequestBody: operation.requestBody != null,
        pathParams: extractPathParams(path),
        declaredPathParams,
        responseStatuses: Object.keys(operation.responses ?? {})
          .map(Number)
          .filter((status) => Number.isInteger(status)),
      });
    }
  }
  return operations.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

/** Returns the declared server URLs so the guard can pin the global prefix into the contract. */
export function loadOpenApiServerUrls(specPath: string): string[] {
  const servers = parseDocument(specPath).servers ?? [];
  return servers
    .map((server) => server.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
}
