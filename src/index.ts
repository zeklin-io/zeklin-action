import * as core from "@actions/core"
import * as Effect from "effect/Effect"

/**
 * The main function for the action.
 */
export const main: Effect.Effect<never, Error, void> =
  Effect.logInfo("Hello, world!")

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error) core.setFailed(error.message)
})
