import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadLog } from "../../logging/mongodb/upload-log.mjs";
import { getFinalLogDataFromWorkflow } from "../workflow-builder/utils.mjs";
import { stripExtension } from "../../logging/utils.mjs";

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function generationTimeMs(historyEntry) {
  const messages = historyEntry?.status?.messages ?? [];
  const at = (type) => messages.find((m) => m?.[0] === type)?.[1]?.timestamp;
  const start = at("execution_start");
  const end = at("execution_success");
  return start != null && end != null ? end - start : null;
}

export function buildLogEntry({
  input,
  finalWorkflowData,
  filename,
  elapsedMs,
  comfyJobId,
}) {
  const {
    model,
    seed,
    sampler,
    scheduler,
    steps,
    cfg,
    positivePrompt,
    negativePrompt,
  } = finalWorkflowData;
  return {
    ...input,
    model,
    prompt: positivePrompt,
    "negative-prompt": negativePrompt,
    steps,
    cfg,
    sampler,
    scheduler,
    seed,
    filename: stripExtension(filename),
    generatedIn: elapsedMs == null ? null : formatDuration(elapsedMs),
    comfyJobId,
  };
}

export async function writeLog(logPath, entries) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, JSON.stringify(entries, null, 2));
}

export async function addToLog({
  logPath,
  logEntries,
  job,
  saved,
  promptId,
  historyEntry,
  dbConnection,
}) {
  const elapsedMs = generationTimeMs(historyEntry);
  const finalWorkflowData = getFinalLogDataFromWorkflow(job.workflow);
  const newEntries = [];
  for (const file of saved) {
    const entry = buildLogEntry({
      input: job.input,
      finalWorkflowData,
      filename: file.filename,
      elapsedMs,
      comfyJobId: promptId,
    });
    logEntries.push(entry);
    newEntries.push(entry);
  }
  await writeLog(logPath, logEntries);
  if (newEntries.length > 0) {
    try {
      await uploadLog(newEntries, dbConnection);
    } catch (error) {
      console.error(`Log upload failed: ${error?.message ?? error}`);
    }
  }
  return logEntries;
}
