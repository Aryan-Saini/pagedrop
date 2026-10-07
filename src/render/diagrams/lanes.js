/**
 * `lanes` fence. Placeholder until the implementation lands.
 *
 * @module render/diagrams/lanes
 */

import { Ctx, wantObject } from "../schema/common.js";
import { figure } from "./svg.js";

/** Validate a `lanes` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "lanes");
  wantObject(ctx, block.data, "", "an object");
}

/** Fill defaults on a validated body. */
export const normalize = (data) => data;

/** Render a validated, normalized `lanes` block. */
export function render(block) {
  return figure("", block.data?.title ?? "", block.data?.note ?? "");
}
