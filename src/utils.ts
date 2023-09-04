import * as Effect from "effect/Effect"
import * as core from "@actions/core"

export const logInfo = (message: string) => Effect.sync(() => core.info(message))
export const logDebug = (message: string) => Effect.sync(() => core.debug(`-- ${message}`))
