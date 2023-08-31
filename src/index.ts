import * as core from "@actions/core"
import { setFailed } from "@actions/core"
import { Chunk, Data, Either, Option, pipe } from "effect"
import * as Effect from "effect/Effect"
import { logDebug, logInfo } from "./utils"
import { debugVariables, NES } from "./envvars"
import { run } from "./run"

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

export class Inputs extends Data.TaggedClass("Inputs")<{
  apikey: NES
  cmd: Chunk.Chunk<NES>
  outputFilePath: NES
  workdir: Option.Option<NES>
}> {}

const unsafeParseInputs: () => Either.Either<Error, Inputs> = () => {
  const unsafeRequiredInput = (name: string): NES => {
    const v = core.getInput(name, { required: true, trimWhitespace: true })

    core.debug(`-- input ${name}: ${v}`)

    if (v.length === 0) throw new Error(`Input ${name} is required`)
    else return NES.unsafe(v)
  }

  const unsafeRequiredMultilineInput = (name: string): Chunk.Chunk<NES> => {
    const v: string[] = core.getMultilineInput(name, { required: true, trimWhitespace: true })

    core.debug(`-- input ${name}: ${v}`)

    if (v.length === 0) throw new Error(`Input ${name} is required`)
    else return pipe(Chunk.fromIterable(v), Chunk.filterMap(NES.fromString))
  }

  const optionalInput = (name: string): Option.Option<NES> => {
    const v = core.getInput(name, { required: false, trimWhitespace: true })

    core.debug(`-- input ${name}: ${v}`)

    return NES.fromString(v)
  }

  try {
    return Either.right(
      new Inputs({
        apikey: unsafeRequiredInput("apikey"),
        outputFilePath: unsafeRequiredInput("output-file-path"),
        cmd: unsafeRequiredMultilineInput("cmd"),
        workdir: optionalInput("workdir"),
      }),
    )
  } catch (error) {
    return Either.left(error as Error)
  }
}

/**
 * The main function for the action.
 */
export const main: Effect.Effect<never, Error, void> = pipe(
  logInfo(banner),
  Effect.flatMap(() => Effect.suspend(unsafeParseInputs)),
  Effect.tap((inputs) => logDebug(`Inputs: ${JSON.stringify(inputs)}`)),
  Effect.flatMap((inputs) => run(inputs)),
)

if (process.env.GITHUB_ACTIONS !== "true") {
  setFailed("The script must be run in GitHub Actions environment")
}

debugVariables()

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error) core.setFailed(error.message)
})
