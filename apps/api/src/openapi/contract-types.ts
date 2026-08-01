/** A route harvested from Nest controller decorator metadata. */
export interface ImplementedRoute {
  /** Uppercase HTTP method (GET, POST, ...). */
  method: string;
  /** Normalized path including the global prefix, with `:id` rewritten to `{id}`. */
  path: string;
  /** Controller class name, for diagnostics. */
  controller: string;
  /** Handler method name, for diagnostics. */
  handler: string;
  /** True when `@Public()` bypasses the global JwtAuthGuard. */
  isPublic: boolean;
  /** True when the handler declares a `@Body()` parameter. */
  hasBody: boolean;
  /** `@HttpCode()` override, or the Nest default (POST 201, everything else 200). */
  successStatus: number;
}

/** An operation parsed from the OpenAPI document. */
export interface DocumentedOperation {
  method: string;
  path: string;
  operationId: string | null;
  hasSecurity: boolean;
  hasRequestBody: boolean;
  /** `{param}` names extracted from the path template. */
  pathParams: string[];
  /** Parameters declared with `in: path` on the operation or the path item. */
  declaredPathParams: string[];
  responseStatuses: number[];
}

export type MismatchKind =
  | "undocumented_route"
  | "documented_but_missing"
  | "method_mismatch"
  | "path_param_mismatch"
  | "undeclared_path_param"
  | "missing_security"
  | "unexpected_security"
  | "missing_request_body"
  | "missing_success_status";

export interface ContractMismatch {
  kind: MismatchKind;
  method: string;
  path: string;
  detail: string;
}
