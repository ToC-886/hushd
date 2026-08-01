import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RequestMethod } from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { IS_PUBLIC_KEY } from "../auth/constants";
import type { ImplementedRoute } from "./contract-types";

const METHOD_NAMES = new Map<RequestMethod, string>([
  [RequestMethod.GET, "GET"],
  [RequestMethod.POST, "POST"],
  [RequestMethod.PUT, "PUT"],
  [RequestMethod.PATCH, "PATCH"],
  [RequestMethod.DELETE, "DELETE"],
  [RequestMethod.HEAD, "HEAD"],
  [RequestMethod.OPTIONS, "OPTIONS"],
]);

interface ControllerConstructor {
  readonly name: string;
  readonly prototype: Record<string, unknown>;
}

/** Rewrites Nest `:param` segments to the OpenAPI `{param}` shape and collapses slashes. */
export function normalizeRoutePath(...parts: Array<string | undefined>): string {
  const joined = `/${parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("/")}`;
  const collapsed = joined.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return collapsed
    .split("/")
    .map((segment) => (segment.startsWith(":") ? `{${segment.slice(1)}}` : segment))
    .join("/");
}

/** Removes the global prefix so implementation paths land in the spec's server-relative space. */
export function stripRoutePrefix(path: string, globalPrefix: string): string {
  const prefix = `/${globalPrefix}`;
  if (path === prefix) return "/";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

/** Reads the global prefix from main.ts so the guard tracks it instead of hardcoding it. */
export function readGlobalPrefix(mainTsPath: string): string {
  const source = readFileSync(mainTsPath, "utf8");
  const match = source.match(/setGlobalPrefix\(\s*["'`]([^"'`]+)["'`]/);
  if (!match) {
    throw new Error(`setGlobalPrefix("...") not found in ${mainTsPath}`);
  }
  return match[1];
}

function listControllerFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listControllerFiles(fullPath));
    } else if (entry.endsWith(".controller.ts")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function firstPath(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hasBodyParam(controllerClass: ControllerConstructor, methodName: string): boolean {
  const argsMetadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, controllerClass, methodName) as
    | Record<string, { index: number }>
    | undefined;
  const bodyKey = String(RouteParamtypes.BODY);
  return Object.keys(argsMetadata ?? {}).some((key) => key.split(":")[0] === bodyKey);
}

/**
 * Discovers every `*.controller.ts` under srcDir and harvests routes from
 * decorator metadata — no Nest application boot, so no env vars, database, or
 * Redis are needed. Controllers are required dynamically from the filesystem
 * so a newly added controller cannot silently escape the contract check.
 */
export function collectImplementedRoutes(srcDir: string, globalPrefix: string): ImplementedRoute[] {
  const routes: ImplementedRoute[] = [];
  for (const file of listControllerFiles(srcDir)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime discovery is the point
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== "function") continue;
      const basePath = firstPath(Reflect.getMetadata(PATH_METADATA, exported) as string | string[] | undefined);
      if (basePath === undefined) continue;
      const controllerClass = exported as unknown as ControllerConstructor;
      const classIsPublic = Boolean(Reflect.getMetadata(IS_PUBLIC_KEY, exported));
      for (const methodName of Object.getOwnPropertyNames(controllerClass.prototype)) {
        if (methodName === "constructor") continue;
        const handler = controllerClass.prototype[methodName];
        if (typeof handler !== "function") continue;
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (requestMethod === undefined) continue;
        const method = METHOD_NAMES.get(requestMethod);
        if (!method) {
          throw new Error(`Unsupported RequestMethod on ${controllerClass.name}.${methodName}`);
        }
        const subPath = firstPath(Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined);
        const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
        const isPublic = Boolean(Reflect.getMetadata(IS_PUBLIC_KEY, handler)) || classIsPublic;
        routes.push({
          method,
          path: normalizeRoutePath(globalPrefix, basePath, subPath),
          controller: controllerClass.name,
          handler: methodName,
          isPublic,
          hasBody: hasBodyParam(controllerClass, methodName),
          successStatus: httpCode ?? (method === "POST" ? 201 : 200),
        });
      }
    }
  }
  return routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}
