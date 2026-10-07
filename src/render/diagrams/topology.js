/**
 * `topology` fence. Placeholder until the implementation lands.
 *
 * @module render/diagrams/topology
 */

import { Ctx, wantObject } from "../schema/common.js";
import { figure } from "./svg.js";

/** Validate a `topology` fence body. */
export function validate(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "topology");
  wantObject(ctx, block.data, "", "an object");
}

/** Fill defaults on a validated body. */
export const normalize = (data) => data;

/** Render a validated, normalized `topology` block. */
export function render(block) {
  return figure("", block.data?.title ?? "", block.data?.note ?? "");
}
