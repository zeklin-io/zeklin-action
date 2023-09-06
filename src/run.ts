import * as core from "@actions/core"
import { ExitCode } from "@actions/core"
import { Data, Duration, Match, Option, pipe, Schedule } from "effect"
import * as Effect from "effect/Effect"
import { exec, ExecOptions, getExecOutput } from "@actions/exec"
import * as fs from "fs/promises"
import { Inputs } from "./index.js"
import { logDebug, logInfo } from "./utils.js"
import * as envvars from "./envvars.js"
import { NES, RunnerArch, RunnerOs } from "./envvars.js"
import * as path from "path"
import fetch from "node-fetch"
import * as github from "@actions/github"
import { Context } from "@actions/github/lib/context.js"

const isPullRequest = (context: Context) => context.payload.pull_request !== undefined

core.debug(`-- context: ${JSON.stringify(github.context, null, 2)}`)
core.debug(`-- isPullRequest : ${isPullRequest(github.context)}`)

class PullRequest extends Data.TaggedClass("PullRequest")<{
  prId: number
  prNumber: number
  prTitle: NES
  baseLabel: NES
  baseRef: NES
  baseSha: NES
  headLabel: NES
  headRef: NES
  headSha: NES
  userId: number
}> {
  static unsafeFrom(context: Context): PullRequest | undefined {
    if (isPullRequest(context)) {
      const pr = context.payload.pull_request!

      return new PullRequest({
        prId: Number(pr.id),
        prNumber: Number(pr.number),
        prTitle: NES.unsafeFromString(pr.title),
        baseLabel: NES.unsafeFromString(pr.base.label),
        baseRef: NES.unsafeFromString(pr.base.ref),
        baseSha: NES.unsafeFromString(pr.base.sha),
        headLabel: NES.unsafeFromString(pr.head.label),
        headRef: NES.unsafeFromString(pr.head.ref),
        headSha: NES.unsafeFromString(pr.head.sha),
        userId: Number(pr.user.id),
      })
    } else {
      return undefined
    }
  }
}

// prettier-ignore
class PostJmhResultBody extends Data.TaggedClass("PostJmhResultBody")<{
  workflowRunId: number        // GITHUB_RUN_ID
  workflowRunNumber: number    // GITHUB_RUN_NUMBER
  workflowRunnerName: NES      // GITHUB_RUNNER_NAME
  workflowRunAttempt: number   // GITHUB_RUN_ATTEMPT
  runnerEnvironment: NES       // RUNNER_ENVIRONMENT
  runnerOs: RunnerOs           // RUNNER_OS
  runnerArch: RunnerArch       // RUNNER_ARCH
  orgId: number                // GITHUB_REPOSITORY_OWNER_ID
  projectId: number            // GITHUB_REPOSITORY_ID
  branchName: NES
  commitMessage: string,
  commitHash: NES
  previousCommitHash: NES,
  actor: NES                   // GITHUB_ACTOR
  actorId: number              // GITHUB_ACTOR_ID
  pr: PullRequest | undefined
  data: JSON
  computedAt: Date
  context: Context
}> {
  static unsafeFrom(context: Context, data: JSON, computedAt: Date, commitMessage: string): PostJmhResultBody {
    const [before, after]: readonly [NES, NES] =
      pipe(
        Match.value({ before: context.payload.before, after: context.payload.after, action: context.payload.action }),
        Match.when({
          before: (_: string | undefined) => _ !== undefined,
          after: (_: string | undefined) => _ !== undefined
        }, () => {
          const before = NES.unsafeFromString(context.payload.before)
          const after = NES.unsafeFromString(context.payload.after)

          return [before, after] as const
        }),
        Match.when({ action: "opened" }, () => {
          const after = NES.unsafeFromString(context.payload.pull_request!.head.sha)
          const before = NES.unsafeFromString(context.payload.pull_request!.base.sha)

          return [before, after] as const
        }),
        Match.orElse((e) => {
          throw new Error(`Unhandled 'payload.action' type: ${e.action}`)
        }) // TODO: To improve?
      )

    // See https://stackoverflow.com/a/58035262/2431728
    const branchName =
      NES.unsafeFromString(
        context.payload.pull_request?.head.ref ?? context.ref.replace("refs/heads/", "")
      )

    return new PostJmhResultBody({
      workflowRunId: envvars.GITHUB_RUN_ID,
      workflowRunNumber: envvars.GITHUB_RUN_NUMBER,
      workflowRunnerName: envvars.RUNNER_NAME,
      workflowRunAttempt: envvars.GITHUB_RUN_ATTEMPT,
      runnerEnvironment: envvars.RUNNER_ENVIRONMENT,
      runnerOs: envvars.RUNNER_OS,
      runnerArch: envvars.RUNNER_ARCH,
      orgId: envvars.GITHUB_REPOSITORY_OWNER_ID,
      projectId: envvars.GITHUB_REPOSITORY_ID,
      branchName: branchName,
      commitMessage: commitMessage,
      commitHash: after,
      previousCommitHash: before,
      actor: envvars.GITHUB_ACTOR,
      actorId: envvars.GITHUB_ACTOR_ID,
      pr: PullRequest.unsafeFrom(context),
      data: data,
      computedAt: computedAt,
      context: context
    })
  }
}

const execCommands: (inputs: Inputs) => Effect.Effect<never, Error, ExitCode> = (inputs: Inputs) => {
  const args: string[] = []

  // @ts-expect-error "The TS `exactOptionalPropertyTypes` option make it fail to compile"
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

const pingServer: Effect.Effect<never, Error, void> = pipe(
  Effect.tryPromise({
    try: (signal) => {
      return fetch(`${envvars.ZEKLIN_SERVER_URL}/ping`, {
        method: "GET",
        headers: {
          "User-Agent": "zeklin-action",
        },
        signal: signal,
      }).then((response) => {
        if (!response.ok) {
          Promise.reject(Error(`Failed to ping Zeklin servers: ${response.status} ${response.statusText}`))
        }
      })
    },
    catch: (_) => _ as Error,
  }),
  Effect.retry(Schedule.intersect(Schedule.recurs(3), Schedule.spaced(Duration.seconds(1)))),
)

const uploadResults: (inputs: Inputs, results: JSON, computedAt: Date) => Effect.Effect<never, Error, void> = (
  inputs: Inputs,
  results: JSON,
  computedAt: Date,
) => {
  const postData = (commitMessage: string) =>
    pipe(
      Effect.tryPromise({
        try: (signal) => {
          const body = PostJmhResultBody.unsafeFrom(github.context, results, computedAt, commitMessage)
          const buff = Buffer.from(JSON.stringify(body, null, 0), "utf-8")
          const credentials = Buffer.from(`${inputs.apikeyId}:${inputs.apikey}`).toString("base64")

          return fetch(`${envvars.ZEKLIN_SERVER_URL}/api/runs/jmh`, {
            method: "POST",
            body: buff,
            headers: {
              "User-Agent": "zeklin-action",
              "Content-Type": "application/json",
              Authorization: `Basic ${credentials}`,
            },
            signal: signal,
          }).then((response) => {
            if (!response.ok) {
              Promise.reject(Error(`Failed to upload results: ${response.status} ${response.statusText}`))
            }
          })
        },
        catch: (_) => _ as Error,
      }),
      Effect.retry(Schedule.intersect(Schedule.recurs(3), Schedule.spaced(Duration.seconds(1)))),
    )

  return pipe(
    Effect.tryPromise(() => getExecOutput("git show -s --format=%s")), // See https://github.com/orgs/community/discussions/28474#discussioncomment-6300866
    Effect.tap((commitMessage) =>
      logDebug(`Commit message - stdout: ${commitMessage.stdout}, stderr: ${commitMessage.stderr}, exitCode: ${commitMessage.exitCode}`),
    ),
    Effect.mapError((e) => new Error(`Failed to get commit message: ${e}`)),
    Effect.flatMap((commitMessage) => postData(commitMessage.stdout)),
  )
}

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
    Effect.flatMap(([results, computedAt]) => uploadResults(inputs, results, computedAt)),
  )
