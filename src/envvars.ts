import { Data, Option, pipe } from "effect"
import { logDebug } from "./utils"
import * as S from "@effect/schema/Schema"

const NESBrand = Symbol.for("NonEmptyString")
const NESSchema = pipe(S.string, S.trim, S.nonEmpty(), S.brand(NESBrand))
export type NES = S.To<typeof NESSchema>
export const NES = {
  unsafe: (s: string): NES => s as NES,
  fromString: (s: string): Option.Option<NES> => S.parseOption(NESSchema)(s),
  unsafeFromString: (s: string): NES => S.parseSync(NESSchema)(s),
}

const HttpsUrlBrand = Symbol.for("HttpsUrl")
const HttpsUrlSchema = pipe(S.string, S.trim, S.startsWith("https://"), S.brand(HttpsUrlBrand))
export type HttpsUrl = S.To<typeof HttpsUrlSchema>
const HttpsUrl = {
  unsafeFromString: (s: string): HttpsUrl => S.parseSync(HttpsUrlSchema)(s),
}

export type Ref = Data.TaggedEnum<{ Branch: { value: NES }; Tag: { value: NES } }>
export const Ref = Data.taggedEnum<Ref>()
export const Ref_ = {
  unsafeMake(refType: NES, value: NES): Ref {
    switch (refType.toLowerCase()) {
      case "branch":
        return Ref("Branch")({ value: value })
      case "tag":
        return Ref("Tag")({ value: value })
      default:
        throw new Error(`Invalid ref type: ${refType}`)
    }
  },
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
 * The owner and repository name.
 * For example, octocat/Hello-World.
 */
export const GITHUB_REPOSITORY: NES = NES.unsafeFromString(process.env.GITHUB_REPOSITORY!)

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
 * The commit SHA that triggered the workflow.
 * The value of this commit SHA depends on the event that triggered the workflow.
 * For more information, see [Events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows).
 * For example, ffac537e6cbbf934b08745a378932722df287a53.
 */
export const GITHUB_SHA: NES = NES.unsafeFromString(process.env.GITHUB_SHA!)

/**
 * The short ref name of the branch or tag that triggered the workflow run.
 * This value matches the branch or tag name shown on GitHub.
 * For example, feature-branch-1.
 */
export const GITHUB_REF_NAME: NES = NES.unsafeFromString(process.env.GITHUB_REF_NAME!)

/**
 * The type of ref that triggered the workflow run.
 * Valid values are "branch" or "tag".
 */
export const GITHUB_REF_TYPE: NES = NES.unsafeFromString(process.env.GITHUB_REF_TYPE!)

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
 * Returns the API URL.
 * For example: https://api.github.com.
 */
export const GITHUB_API_URL: HttpsUrl = HttpsUrl.unsafeFromString(process.env.GITHUB_API_URL!)

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
 * The URL of the GitHub server.
 * For example: https://github.com.
 */
export const GITHUB_SERVER_URL: HttpsUrl = HttpsUrl.unsafeFromString(process.env.GITHUB_SERVER_URL!)

/**
 * Comes from https://docs.github.com/en/actions/learn-github-actions/variables
 */
export const WORKFLOW_URL: HttpsUrl = HttpsUrl.unsafeFromString(`${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`)

export const REF: Ref = Ref_.unsafeMake(GITHUB_REF_TYPE, GITHUB_REF_NAME)

export const debugVariables = () => {
  logDebug(`ZEKLIN_SERVER_URL: ${ZEKLIN_SERVER_URL}`)
  logDebug(`GITHUB_RUN_ID: ${GITHUB_RUN_ID}`)
  logDebug(`GITHUB_RUN_NUMBER: ${GITHUB_RUN_NUMBER}`)
  logDebug(`GITHUB_RUNNER_NAME: ${RUNNER_NAME}`)
  logDebug(`GITHUB_RUN_ATTEMPT: ${GITHUB_RUN_ATTEMPT}`)
  logDebug(`GITHUB_REPOSITORY: ${GITHUB_REPOSITORY}`)
  logDebug(`GITHUB_REPOSITORY_ID: ${GITHUB_REPOSITORY_ID}`)
  logDebug(`GITHUB_REPOSITORY_OWNER_ID: ${GITHUB_REPOSITORY_OWNER_ID}`)
  logDebug(`GITHUB_SHA: ${GITHUB_SHA}`)
  logDebug(`GITHUB_REF_NAME: ${GITHUB_REF_NAME}`)
  logDebug(`GITHUB_REF_TYPE: ${GITHUB_REF_TYPE}`)
  logDebug(`RUNNER_ENVIRONMENT: ${RUNNER_ENVIRONMENT}`)
  logDebug(`RUNNER_OS: ${RUNNER_OS}`)
  logDebug(`RUNNER_ARCH: ${RUNNER_ARCH}`)
  logDebug(`GITHUB_API_URL: ${GITHUB_API_URL}`)
  logDebug(`GITHUB_ACTOR: ${GITHUB_ACTOR}`)
  logDebug(`GITHUB_ACTOR_ID: ${GITHUB_ACTOR_ID}`)
  logDebug(`GITHUB_SERVER_URL: ${GITHUB_SERVER_URL}`)
  logDebug(`WORKFLOW_URL: ${WORKFLOW_URL}`)
  logDebug(`REF: ${REF}`)
}
