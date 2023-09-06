import { Option, pipe } from "effect"
import * as S from "@effect/schema/Schema"
import * as core from "@actions/core"

const NESBrand = Symbol.for("NonEmptyString")
const NESSchema = pipe(S.string, S.trim, S.nonEmpty(), S.brand(NESBrand))
export type NES = S.To<typeof NESSchema>
export const NES = {
  unsafe: (s: string): NES => s as NES,
  fromString: (s: string): Option.Option<NES> => S.parseOption(NESSchema)(s),
  unsafeFromString: (s: string): NES => S.parseSync(NESSchema)(s),
}

export type RunnerOs = "linux" | "windows" | "macos"
const RunnerOs = {
  unsafeFromString: (s: string): RunnerOs => {
    switch (s.toLowerCase()) {
      case "linux":
        return "linux"
      case "windows":
        return "windows"
      case "macos":
        return "macos"
      default:
        throw new Error(`Invalid runner OS: ${s}`)
    }
  },
}

export type RunnerArch = "x86" | "x64" | "arm" | "arm64"
const RunnerArch = {
  unsafeFromString: (s: string): RunnerArch => {
    switch (s.toLowerCase()) {
      case "x86":
        return "x86"
      case "x64":
        return "x64"
      case "arm":
        return "arm"
      case "arm64":
        return "arm64"
      default:
        throw new Error(`Invalid runner arch: ${s}`)
    }
  },
}

// -- Envvars --
//
// Documentation of GitHub envvars: https://docs.github.com/en/actions/learn-github-actions/variables
//

export const ZEKLIN_SERVER_URL: NES = NES.unsafeFromString(process.env["ZEKLIN_SERVER_URL"] ?? "https://api.zeklin.io")

/**
 * A unique number for each workflow run within a repository.
 * This number does not change if you re-run the workflow run.
 * For example, 1658821493.
 */
export const GITHUB_RUN_ID: number = Number(process.env.GITHUB_RUN_ID!)

/**
 * A unique number for each run of a particular workflow in a repository.
 * This number begins at 1 for the workflow's first run, and increments with each new run.
 * This number does not change if you re-run the workflow run.
 * For example, 3.
 */
export const GITHUB_RUN_NUMBER: number = Number(process.env.GITHUB_RUN_NUMBER!)

/**
 * [Not documented]
 */
export const RUNNER_NAME: NES = NES.unsafeFromString(process.env.RUNNER_NAME!)

/**
 * A unique number for each attempt of a particular workflow run in a repository.
 * This number begins at 1 for the workflow run's first attempt, and increments with each re-run.
 * For example, 3.
 */
export const GITHUB_RUN_ATTEMPT: number = Number(process.env.GITHUB_RUN_ATTEMPT!)

/**
 * The ID of the repository.
 * For example, 123456789.
 * Note that this is different from the repository name.
 */
export const GITHUB_REPOSITORY_ID: number = Number(process.env.GITHUB_REPOSITORY_ID!)

/**
 * The repository owner's account ID.
 * For example, 1234567.
 * Note that this is different from the owner's name.
 */
export const GITHUB_REPOSITORY_OWNER_ID: number = Number(process.env.GITHUB_REPOSITORY_OWNER_ID!)
/**
 * [Not documented]
 *
 * In GitHub, the value seems to be "github-hosted"
 * TBC: In self-hosted runners, the value is probably something like to be "self-hosted"
 */
export const RUNNER_ENVIRONMENT: NES = NES.unsafeFromString(process.env.RUNNER_ENVIRONMENT!)

/**
 * The operating system of the runner executing the job.
 * Possible values are Linux, Windows, or macOS.
 * For example, Windows
 */
export const RUNNER_OS: RunnerOs = RunnerOs.unsafeFromString(process.env.RUNNER_OS!)

/**
 * The architecture of the runner executing the job.
 * Possible values are X86, X64, ARM, or ARM64.
 */
export const RUNNER_ARCH: RunnerArch = RunnerArch.unsafeFromString(process.env.RUNNER_ARCH!)

/**
 * The name of the person or app that initiated the workflow.
 * For example, octocat.
 */
export const GITHUB_ACTOR: NES = NES.unsafeFromString(process.env.GITHUB_ACTOR!)

/**
 * The account ID of the person or app that triggered the initial workflow run.
 * For example, 1234567. Note that this is different from the actor username.
 */
export const GITHUB_ACTOR_ID: number = Number(process.env.GITHUB_ACTOR_ID!)

/**
 * https://github.com/orgs/community/discussions/28474#discussioncomment-6300866
 */
export const HEAD_COMMIT_MESSAGE: string = process.env.HEAD_COMMIT_MESSAGE!

export const debugVariables = () => {
  core.debug(`ZEKLIN_SERVER_URL: ${ZEKLIN_SERVER_URL}`)
  core.debug(`GITHUB_RUN_ID: ${GITHUB_RUN_ID}`)
  core.debug(`GITHUB_RUN_NUMBER: ${GITHUB_RUN_NUMBER}`)
  core.debug(`GITHUB_RUNNER_NAME: ${RUNNER_NAME}`)
  core.debug(`GITHUB_RUN_ATTEMPT: ${GITHUB_RUN_ATTEMPT}`)
  core.debug(`GITHUB_REPOSITORY_ID: ${GITHUB_REPOSITORY_ID}`)
  core.debug(`GITHUB_REPOSITORY_OWNER_ID: ${GITHUB_REPOSITORY_OWNER_ID}`)
  core.debug(`RUNNER_ENVIRONMENT: ${RUNNER_ENVIRONMENT}`)
  core.debug(`RUNNER_OS: ${RUNNER_OS}`)
  core.debug(`RUNNER_ARCH: ${RUNNER_ARCH}`)
  core.debug(`GITHUB_ACTOR: ${GITHUB_ACTOR}`)
  core.debug(`GITHUB_ACTOR_ID: ${GITHUB_ACTOR_ID}`)
  core.debug(`HEAD_COMMIT_MESSAGE: ${HEAD_COMMIT_MESSAGE}`)
}
