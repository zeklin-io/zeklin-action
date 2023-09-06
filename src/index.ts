import * as core from "@actions/core"
import { setFailed } from "@actions/core"
import { Chunk, Data, Either, Match, Option, pipe } from "effect"
import * as Effect from "effect/Effect"
import { logDebug, logInfo } from "./utils.js"
import { debugVariables, NES } from "./envvars.js"
import { run } from "./run.js"
import { Context } from "@actions/github/lib/context.js"
import * as github from "@actions/github"
import { exec, getExecOutput } from "@actions/exec"

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
  apikeyId: NES
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
        apikey: unsafeRequiredInput("api-key"),
        apikeyId: unsafeRequiredInput("api-key-id"),
        outputFilePath: unsafeRequiredInput("output-file-path"),
        cmd: unsafeRequiredMultilineInput("cmd"),
        workdir: optionalInput("workdir"),
      }),
    )
  } catch (error) {
    return Either.left(error as Error)
  }
}

const unsafeGetBeforeAfter: (context: Context) => readonly [NES, NES] = (context: Context) =>
  pipe(
    Match.value({ before: context.payload.before, after: context.payload.after, action: context.payload.action }),
    Match.when(
      {
        before: (_: string | undefined) => _ !== undefined,
        after: (_: string | undefined) => _ !== undefined,
      },
      () => {
        const before = NES.unsafeFromString(context.payload.before)
        const after = NES.unsafeFromString(context.payload.after)

        return [before, after] as const
      },
    ),
    Match.when({ action: "opened" }, () => {
      const after = NES.unsafeFromString(context.payload.pull_request!.head.sha)
      const before = NES.unsafeFromString(context.payload.pull_request!.base.sha)

      return [before, after] as const
    }),
    Match.orElse((e) => {
      throw new Error(`Unhandled 'payload.action' type: ${e.action}`)
    }), // TODO: To improve?
  )

/**
 * See https://github.com/orgs/community/discussions/28474#discussioncomment-6300866
 *
 * We need to fetch as the "after" commit is not the one we're on in GHA.
 * GHA seems to create a merge commit between the "after" commit and the "before" commit and run from this merge commit.
 */
const getCommitMessage = (after: NES): Effect.Effect<never, Error, string> =>
  pipe(
    Effect.tryPromise(() => exec("git", ["fetch", "--depth=2", "--quiet"], { silent: true, failOnStdErr: true })),
    Effect.flatMap(() =>
      Effect.tryPromise(() =>
        getExecOutput("git", ["show", "-s", "--format=%s", after], {
          silent: true,
          failOnStdErr: true,
        }),
      ),
    ),
    Effect.tap((commitMessage) =>
      logDebug(
        `Commit message - stdout: "${commitMessage.stdout.trim()}", stderr: "${commitMessage.stderr.trim()}", exitCode: ${
          commitMessage.exitCode
        }`,
      ),
    ),
    Effect.mapBoth({
      onFailure: (e) => new Error(`Failed to get commit message: ${e}`),
      onSuccess: (_) => _.stdout,
    }),
  )

/**
 * The main function for the action.
 */
export const main: Effect.Effect<never, Error, void> = pipe(
  logInfo(banner),
  Effect.flatMap(() => Effect.suspend(unsafeParseInputs)),
  Effect.tap((inputs) => logDebug(`Inputs: ${JSON.stringify(inputs)}`)),
  Effect.flatMap((inputs) =>
    pipe(
      Effect.sync(() => unsafeGetBeforeAfter(github.context)),
      Effect.map((beforeAfter) => [inputs, beforeAfter] as const),
    ),
  ),
  Effect.flatMap(([inputs, [before, after]]) =>
    pipe(
      getCommitMessage(after),
      Effect.map((commitMessage) => [inputs, before, after, commitMessage] as const),
    ),
  ),
  Effect.flatMap(([inputs, before, after, commitMessage]) => run(inputs, before, after, commitMessage)),
)

if (process.env.GITHUB_ACTIONS !== "true") {
  setFailed("The script must be run in GitHub Actions environment")
}

debugVariables()

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error) core.setFailed(error.message)
})
