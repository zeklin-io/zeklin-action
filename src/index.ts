import * as core from "@actions/core"
import { ExitCode } from "@actions/core"
import { Data, Either, Option, pipe } from "effect"
import * as Effect from "effect/Effect"
import { exec, ExecOptions } from "@actions/exec"
import { ExecListeners } from "@actions/exec/lib/interfaces"

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
const logDebug = (message: string) => Effect.sync(() => core.debug(`-- ${message}`))

const listeners: ExecListeners = {
  errline: (line) => core.info("-- listener stderr: " + line),
  debug: (data) => core.debug("-- listener debug: " + data),
}

const execCommand: (inputs: Inputs) => Effect.Effect<never, Error, ExitCode> = (inputs: Inputs) =>
  pipe(
    logDebug(`Running: '${inputs.cmd}' cmd ...`),
    Effect.flatMap(() =>
      Effect.tryPromise({
        try: () => {
          const args: string[] = []

          const options: ExecOptions = {
            cwd: Option.getOrUndefined(inputs.workdir),
            listeners: listeners,
          }

          return exec(`sh -c "${inputs.cmd}"`, args, options)
        },
        catch: (_) => _ as Error,
      }),
    ),
    Effect.tapBoth({
      onFailure: (error) => logDebug(`Running: '${inputs.cmd}' cmd failed: ${error.message}`),
      onSuccess: (exitCode) => logDebug(`Running: '${inputs.cmd}' cmd exited with: ${exitCode}`),
    }),
  )

/**
 * The main function for the action.
 */
export const main: Effect.Effect<never, Error, void> = pipe(
  logInfo(banner),
  Effect.flatMap(() => Effect.suspend(unsafeParseInputs)),
  Effect.tap((inputs) => logDebug(`Inputs: ${JSON.stringify(inputs)}`)),
  Effect.flatMap((inputs) => execCommand(inputs).pipe(Effect.map((_) => [_, inputs] as const))),
  Effect.flatMap(([exitCode, inputs]) =>
    exitCode === ExitCode.Success
      ? logInfo(`🎉 '${inputs.cmd}' ran successfully!`)
      : Effect.fail(new Error(`❌ '${inputs.cmd}' exited with non-zero exit code: ${exitCode}`)),
  ),
)

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error) {
    core.error(error)
    core.setFailed(error.message)
  }
})
