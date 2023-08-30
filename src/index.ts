import * as core from "@actions/core"
import { Data, Either, Option, pipe } from "effect"
import * as Effect from "effect/Effect"

const banner = String.raw`
 ___________
< Zeklin.io >
 -----------
     \\
      \\
          oO)-.                       .-(Oo
         /__  _\\                     /_  __\\
         \\  \\(  |     ()~()         |  )/  /
          \\__|\\ |    (-___-)        | /|__/
          '  '--'    ==\`-'==        '--'  '
`

class Inputs extends Data.TaggedClass("Inputs")<{
  apikey: string
  cmd: string
  workdir: Option.Option<string>
}> {}

const unsafeParseInputs: () => Either.Either<Error, Inputs> = () => {
  const unsafeRequiredInput = (name: string) => {
    const v = core.getInput(name, { required: true, trimWhitespace: true })

    if (v.length === 0) throw new Error(`Input ${name} is required`)
    else return v
  }

  const optionalInput = (name: string) => {
    const v = core.getInput(name, { required: false, trimWhitespace: true })

    if (v.length === 0) return Option.none()
    else return Option.some(v)
  }

  try {
    return Either.right(
      new Inputs({
        apikey: unsafeRequiredInput("apikey"),
        cmd: unsafeRequiredInput("cmd"),
        workdir: optionalInput("workdir"),
      }),
    )
  } catch (error) {
    return Either.left(error as Error)
  }
}

const logInfo = (message: string) => Effect.sync(() => core.info(message))
const logDebug = (message: string) => Effect.sync(() => core.debug(message))
const setFailed = (message: string | Error) => Effect.sync(() => core.setFailed(message))

/**
 * The main function for the action.
 */
export const main: Effect.Effect<never, Error, void> = pipe(
  logInfo(banner),
  Effect.flatMap(() => Effect.suspend(unsafeParseInputs)),
  Effect.tapBoth({
    onFailure: (error) => setFailed(error),
    onSuccess: (inputs) => logDebug(`Inputs: ${JSON.stringify(inputs)}`),
  }),
)

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error) core.setFailed(error.message)
})
