/**
 * `trellis` fence. Placeholder until the implementation lands: rejects every body.
 *
 * @module render/diagrams/trellis
 */

import { Ctx } from "../schema/common.js";
import { figure } from "./svg.js";

/** Validate a `trellis` fence body. */
export function validate(errors, block, file) {
  new Ctx(errors, file, block.line, "trellis").at("", "is not implemented yet");
}

/** Fill defaults on a validated body. */
export const normalize = (data) => data;

/** Render a validated, normalized `trellis` block. */
export function render(block) {
  return figure("", block.data?.title ?? "", block.data?.note ?? "");
}
