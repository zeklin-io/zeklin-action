import * as core from "@actions/core"
import { ExitCode } from "@actions/core"
import { Chunk, Data, Either, Option, pipe } from "effect"
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
  cmd: Chunk.Chunk<string>
  workdir: Option.Option<string>
}> {}

const unsafeParseInputs: () => Either.Either<Error, Inputs> = () => {
  const unsafeRequiredInput = (name: string): string => {
    const v = core.getInput(name, { required: true, trimWhitespace: true })

    core.debug(`-- input ${name}: ${v}`)

    if (v.length === 0) throw new Error(`Input ${name} is required`)
    else return v
  }

  const unsafeRequiredMultilineInput = (name: string): Chunk.Chunk<string> => {
    const v: string[] = core.getMultilineInput(name, { required: true, trimWhitespace: true })

    core.debug(`-- input ${name}: ${v}`)

    if (v.length === 0) throw new Error(`Input ${name} is required`)
    else return Chunk.fromIterable(v)
  }

  const optionalInput = (name: string): Option.Option<string> => {
    const v = core.getInput(name, { required: false, trimWhitespace: true })

    core.debug(`-- input ${name}: ${v}`)

    if (v.length === 0) return Option.none()
    else return Option.some(v)
  }

  try {
    return Either.right(
      new Inputs({
        apikey: unsafeRequiredInput("apikey"),
        cmd: unsafeRequiredMultilineInput("cmd"),
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
  errline: (line) => core.info(`-- listener stderr: ${line}`),
  debug: (data) => core.debug(`-- listener debug: ${data}`),
}

const execCommands: (inputs: Inputs) => Effect.Effect<never, Error, ExitCode> = (inputs: Inputs) => {
  const args: string[] = []

  const options: ExecOptions = {
    cwd: Option.getOrUndefined(inputs.workdir),
    listeners: listeners,
  }

  const execCommand = (cmd: string) =>
    Effect.tryPromise({
      try: () => exec(cmd, args, options),
      catch: (_) => _ as Error,
    })

  return pipe(
    logDebug(`Running: '${inputs.cmd}' cmd ...`),
    Effect.flatMap(() =>
      Effect.forEach(inputs.cmd, execCommand, {
        concurrency: 1,
        batching: false,
        discard: false,
      }),
    ),
    Effect.map((exitCodes) => exitCodes[exitCodes.length - 1]),
    Effect.tapBoth({
      onFailure: (error) => logDebug(`Running: '${inputs.cmd}' cmd failed: ${error.message}`),
      onSuccess: (exitCode) => logDebug(`Running: '${inputs.cmd}' cmd exited with: ${exitCode}`),
    }),
  )
}

/**
 * The main function for the action.
 */
export const main: Effect.Effect<never, Error, void> = pipe(
  logInfo(banner),
  Effect.flatMap(() => Effect.suspend(unsafeParseInputs)),
  Effect.tap((inputs) => logDebug(`Inputs: ${JSON.stringify(inputs)}`)),
  Effect.flatMap((inputs) => execCommands(inputs).pipe(Effect.map((_) => [_, inputs] as const))),
  Effect.flatMap(([exitCode, inputs]) =>
    exitCode === ExitCode.Success
      ? logInfo(`🎉 '${inputs.cmd}' ran successfully!`)
      : Effect.fail(new Error(`❌ '${inputs.cmd}' exited with non-zero exit code: ${exitCode}`)),
  ),
)

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error) core.setFailed(error.message)
})
