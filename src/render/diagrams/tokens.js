/**
 * `tokens` fence. Placeholder until the implementation lands: rejects every body.
 *
 * @module render/diagrams/tokens
 */

import { Ctx } from "../schema/common.js";
import { figure } from "./svg.js";

/** Validate a `tokens` fence body. */
export function validate(errors, block, file) {
  new Ctx(errors, file, block.line, "tokens").at("", "is not implemented yet");
}

/** Fill defaults on a validated body. */
export const normalize = (data) => data;

/** Render a validated, normalized `tokens` block. */
export function render(block) {
  return figure("", block.data?.title ?? "", block.data?.note ?? "");
}
