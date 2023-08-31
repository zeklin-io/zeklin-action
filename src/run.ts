import * as core from "@actions/core"
import { ExitCode } from "@actions/core"
import { Data, Option, pipe } from "effect"
import * as Effect from "effect/Effect"
import { exec, ExecOptions } from "@actions/exec"
import * as httpm from "@actions/http-client"
import * as fs from "fs/promises"
import { Inputs } from "./index"
import { logDebug, logInfo } from "./utils"
import * as envvars from "./envvars"
import { HttpsUrl, NES, Ref, RunnerArch, RunnerOs } from "./envvars"
import * as path from "path"

// prettier-ignore
class PostJmhResultBody extends Data.TaggedClass("PostJmhResultBody")<{
  workflowRunId: number        // GITHUB_RUN_ID
  workflowRunNumber: number    // GITHUB_RUN_NUMBER
  workflowRunnerName: NES      // GITHUB_RUNNER_NAME
  workflowRunAttempt: number   // GITHUB_RUN_ATTEMPT
  workflowUrl: HttpsUrl        // WORKFLOW_URL
  runnerEnvironment: NES       // RUNNER_ENVIRONMENT
  runnerOs: RunnerOs           // RUNNER_OS
  runnerArch: RunnerArch       // RUNNER_ARCH
  orgId: number                // GITHUB_REPOSITORY_OWNER_ID
  projectId: number            // GITHUB_REPOSITORY_ID
  ref: Ref                     // GITHUB_REF_TYPE & GITHUB_REF_NAME
  commitHash: NES              // GITHUB_SHA
  actor: NES                   // GITHUB_ACTOR
  actorId: number              // GITHUB_ACTOR_ID
  data: JSON
  computedAt: Date
}> {
  static from(data: JSON, computedAt: Date): PostJmhResultBody {
    return new PostJmhResultBody({
      workflowRunId: envvars.GITHUB_RUN_ID,
      workflowRunNumber: envvars.GITHUB_RUN_NUMBER,
      workflowRunnerName: envvars.RUNNER_NAME,
      workflowRunAttempt: envvars.GITHUB_RUN_ATTEMPT,
      workflowUrl: envvars.WORKFLOW_URL,
      runnerEnvironment: envvars.RUNNER_ENVIRONMENT,
      runnerOs: envvars.RUNNER_OS,
      runnerArch: envvars.RUNNER_ARCH,
      orgId: envvars.GITHUB_REPOSITORY_OWNER_ID,
      projectId: envvars.GITHUB_REPOSITORY_ID,
      ref: envvars.REF,
      commitHash: envvars.GITHUB_SHA,
      actor: envvars.GITHUB_ACTOR,
      actorId: envvars.GITHUB_ACTOR_ID,
      data: data,
      computedAt: computedAt
    });
  }
}

const execCommands: (inputs: Inputs) => Effect.Effect<never, Error, ExitCode> = (inputs: Inputs) => {
  const args: string[] = []

  // @ts-ignore
  const options: ExecOptions = {
    cwd: Option.getOrUndefined(inputs.workdir),
    listeners: {
      errline: (line) => core.info(`-- listener stderr: ${line}`),
      debug: (data) => core.debug(`-- listener debug: ${data}`),
    },
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
  )
}

const findResults: (inputs: Inputs) => Effect.Effect<never, Error, JSON> = (inputs: Inputs) =>
  pipe(
    Effect.tryPromise({
      try: () => {
        // short name
        const output = inputs.outputFilePath

        const file: string = (() => {
          if (path.isAbsolute(output)) return output
          else
            return Option.match(inputs.workdir, {
              onNone: () => output,
              onSome: (workdir) => `${workdir}/${output}`,
            })
        })()

        return fs.readFile(file, { encoding: "utf-8" })
      },
      catch: (_) => _ as Error,
    }),
    Effect.flatMap((data) =>
      Effect.try({
        try: () => JSON.parse(data) as JSON,
        catch: (_) => _ as Error,
      }),
    ),
    Effect.tap((data) => logDebug(`Found results: ${JSON.stringify(data, null, 2)}`)),
  )

const pingServer: Effect.Effect<never, Error, void> = Effect.tryPromise({
  try: () => {
    const client = new httpm.HttpClient("zeklin-action")
    return client.get(`${envvars.ZEKLIN_SERVER_URL}/ping`)
  },
  catch: (_) => _ as Error,
})

const uploadResults: (results: JSON, computedAt: Date) => Effect.Effect<never, Error, void> = (results: JSON, computedAt: Date) =>
  Effect.tryPromise({
    try: () => {
      const body = PostJmhResultBody.from(results, computedAt)
      const client = new httpm.HttpClient("zeklin-action")
      return client.postJson(`${envvars.ZEKLIN_SERVER_URL}/api/results/jmh`, body)
    },
    catch: (_) => _ as Error,
  })

/**
 * The main function for the action.
 */
export const run: (inputs: Inputs) => Effect.Effect<never, Error, void> = (inputs: Inputs) =>
  pipe(
    execCommands(inputs),
    Effect.flatMap((exitCode) =>
      exitCode === ExitCode.Success
        ? logInfo(`🎉 '${inputs.cmd}' ran successfully!`).pipe(Effect.as(new Date()))
        : Effect.fail(new Error(`❌ '${inputs.cmd}' exited with non-zero exit code: ${exitCode}`)),
    ),
    Effect.flatMap((computedAt) => findResults(inputs).pipe(Effect.map((_) => [_, computedAt] as const))),
    Effect.flatMap((data) => pingServer.pipe(Effect.as(data))),
    Effect.flatMap(([results, computedAt]) => uploadResults(results, computedAt)),
  )
