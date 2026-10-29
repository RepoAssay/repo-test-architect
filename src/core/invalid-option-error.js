/**
 * Raised when a caller-supplied audit option is invalid. It describes a usage error rather
 * than an adapter failure, so per-project containment rethrows it: the CLI exits with status 1
 * and MCP tools return invalid-arguments.
 */
export class InvalidOptionError extends Error {
  /**
   * @param {string} message
   * @param {{ option: string }} details
   */
  constructor(message, { option }) {
    super(message);
    this.name = "InvalidOptionError";
    this.option = option;
  }
}
