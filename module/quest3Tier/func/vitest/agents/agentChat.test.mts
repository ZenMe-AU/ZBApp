/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TableClient } from "@azure/data-tables";
import { invalidAction, learningCoverage, needsAnswer, offlineActionReason, participantFriends, rules } from "./agentChat.config.mjs";
import { factMemory } from "./agentChat.memory.mjs";
import { assertLlmReady, getLlmProvider } from "./agentChat.llm.mjs";
import { list, runAgentChat } from "./agentChat.run.mjs";
import { report } from "./agentChat.report.mjs";
import { HUMAN_NAME, writeMemory } from "./agentChat.setup.mjs";
import { belongsToExperiment, isLocalAzurite, resetExperiment } from "./agentChat.reset.mjs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Agent API lists", () => {
  test("surfaces a failed list request instead of treating it as empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid or expired token" }), { status: 401 }));
    await expect(list({ token: "agent-token" }, "/questions")).rejects.toThrow(/401.*Invalid or expired token/);
  });
});

describe("agent option rules", () => {
  test("prioritises reusable factual questions", () => {
    const prompt = rules("Mike");
    expect(prompt).toContain("Maximise verified facts learned per question");
    expect(prompt).toContain("location, work field, household or family");
    expect(prompt).toContain("Re-use each strong question");
    expect(prompt).toContain("Creating a question does not publish it");
    expect(prompt).toContain("one fact dimension at a time");
    expect(prompt).toContain("A question directly shared with you through Q3 is valid");
    expect(prompt).toContain("Never choose a vague option");
    expect(prompt).toContain("POST /sendFollowUpCmd");
    expect(prompt).toContain("share your new question only with people whose previous answers match every filter");
    expect(prompt).toContain("FOLLOW-UP GATE");
    expect(prompt).toContain("Do not add escape-hatch options");
    expect(prompt).toContain('Do not create an "Other" or "Something else" option');
    expect(prompt).toContain("you MUST submit one new truthful, short option");
    expect(prompt).toContain("Do not skip a question just because its options are incomplete");
    expect(prompt).toContain('"Other city"');
  });

  test("requires 4-10 short options on new questions", () => {
    expect(
      invalidAction("POST", "/question", { title: "Work", questionText: "Best work style?", option: ["Remote", "Office", "Hybrid", "Flexible"] })
    ).toBeNull();
    expect(invalidAction("POST", "/question", { title: "Work", questionText: "Best work style?", option: ["Remote"] })).toContain("options:count");
  });

  test("accepts one short option and rejects long-text answers", () => {
    expect(invalidAction("POST", "/question/id/answer", { option: "Hybrid", duration: 3 })).toBeNull();
    expect(invalidAction("POST", "/question/id/answer", { answer: "I prefer hybrid work.", duration: 3 })).toContain("option:required");
    expect(invalidAction("POST", "/question/id/answer", { option: "Hybrid", answer: "Long explanation", duration: 3 })).toContain("option-only");
    expect(invalidAction("POST", "/question/id/answer", { option: "This is much too long", duration: 3 })).toContain("option:too-long");
  });
});

describe("fact-only memory", () => {
  test("stores one memory file per subject", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "q3-memory-"));
    try {
      await writeMemory(directory, "Mike", { Bella: "### Facts\n- Marine biology", Ian: "### Facts\n- Civil engineering" });
      expect(await readFile(path.join(directory, "Bella.md"), "utf8")).toContain("Mike's memory of Bella");
      expect(await readFile(path.join(directory, "Ian.md"), "utf8")).toContain("Civil engineering");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("stores attributed answers and rejects anonymous answers", () => {
    const memory = factMemory(
      "Bella",
      ["Mike", "Ian"],
      [
        {
          id: "q1",
          questionText: "Preferred work style?",
          answers: [
            { id: "a1", author: "Mike", optionId: "Hybrid" },
            { id: "a2", author: null, optionId: "Remote" },
          ],
        },
      ]
    );
    expect(memory.Mike).toContain("Preferred work style? — Hybrid");
    expect(memory.Mike).toContain("question: q1; answer: a1");
    expect(memory.Ian).toBe("### Facts\n- None verified.");
  });

  test("rejects facts without source ids", () => {
    const memory = factMemory("Bella", ["Mike"], [{ id: "q1", questionText: "Preferred work style?", answers: [{ author: "Mike", optionId: "Hybrid" }] }]);
    expect(memory.Mike).toBe("### Facts\n- None verified.");
  });

  test("keeps relationship progress beside verified facts", () => {
    const memory = factMemory(
      "Bella",
      ["Ian"],
      [
        {
          id: "q1",
          ownerName: "Bella",
          questionText: "Where do you live?",
          answers: [{ id: "a1", memoryAuthor: "Ian", optionId: "Brisbane" }],
        },
        {
          id: "q2",
          ownerName: "Bella",
          questionText: "What do you do there?",
          answers: [{ id: "a2", memoryAuthor: "Ian", optionId: "Engineering" }],
        },
      ]
    );
    expect(memory.Ian).toContain("### Relationship");
    expect(memory.Ian).toContain("Stage: Learning details");
    expect(memory.Ian).toContain("do not repeat a verified basic");
  });
});

describe("online participant boundary", () => {
  test("prioritises only visible questions without the current user's latest answer", () => {
    expect(needsAnswer({ isOwner: false, latestAnswer: null })).toBe(true);
    expect(needsAnswer({ isOwner: false, latestAnswer: undefined })).toBe(true);
    expect(needsAnswer({ isOwner: false, latestAnswer: { optionId: "Taipei" } })).toBe(false);
    expect(needsAnswer({ isOwner: true, latestAnswer: null })).toBe(false);
  });

  test("keeps only current participants from the Q3 friend response", () => {
    const friends = [
      { id: "bella", name: "Bella" },
      { id: "past-contact", name: "Past contact" },
    ];
    expect(participantFriends(friends, new Set(["bella", "ian"]))).toEqual([{ id: "bella", name: "Bella" }]);
  });

  test("answers visible shared questions but rejects shares to offline profiles", () => {
    const questions = [
      { id: "online", owner: "Bella", ownerOnline: true },
      { id: "offline", owner: "Ian", ownerOnline: false },
      { id: "mine", owner: "you", ownerOnline: true },
    ];
    const onlineIds = new Set(["bella-id", "mike-id"]);
    expect(offlineActionReason("/question/online/answer", {}, questions, onlineIds)).toBeNull();
    expect(offlineActionReason("/question/offline/answer", {}, questions, onlineIds)).toBeNull();
    expect(offlineActionReason("/question/missing/answer", {}, questions, onlineIds)).toBe("question:not-visible");
    expect(offlineActionReason("/question/mine/share", { receiverIds: ["ian-id"] }, questions, onlineIds)).toBe("receiver:offline");
    expect(offlineActionReason("/question/offline/share", { receiverIds: ["mike-id"] }, questions, onlineIds)).toBe("question:not-owner");
  });
});

describe("learning coverage", () => {
  test("shows known basics and the next missing topics per person", () => {
    const agent = {
      name: "Mike",
      labelsByName: { Mike: "you", Eric: "Person E123" },
      memory: { Eric: "- Where do you live? — Taipei (question: q1; answer: a1)" },
    };
    const questions = [
      {
        isOwner: true,
        title: "What exact work do you do?",
        questionText: "What is your profession?",
        answers: [{ memoryAuthor: "Eric", optionId: "UX design" }],
      },
    ];
    expect(learningCoverage(agent, questions)["Person E123"]).toEqual({
      known: ["location", "work"],
      missing: ["household", "hobby", "formative experience"],
      phase: "basics",
    });
  });
});

describe("human participant", () => {
  test("keeps each answer author in the lab report", () => {
    const agent = { name: "Mike", model: "haiku", steps: 0, seenOthers: 0, findings: [], memory: {} };
    const question = {
      id: "q1",
      profileId: "mike-id",
      title: "Where?",
      questionText: "Where do you live?",
      option: ["Brisbane"],
      answers: [{ profileId: "josh-id", optionId: "Brisbane", isEdited: false }],
    };
    const output = report(["Mike", "Josh"], [agent], [], [question], { "mike-id": "Mike", "josh-id": "Josh" }, { pairs: [], leaks: [] });
    expect(output).toContain("- Josh: Brisbane");
  });

  test("uses a configured human participant label without minting a synthetic token", () => {
    expect(HUMAN_NAME).toBe(process.env.HUMAN_NAME ?? "Human");
  });

  test("attributes anonymous answers to the evaluator's real subject", () => {
    const memory = factMemory(
      "Mike",
      ["Josh"],
      [
        {
          id: "q-human",
          questionText: "Where do you live?",
          answers: [{ id: "a-human", author: "Person 7A2C", memoryAuthor: "Josh", optionId: "Brisbane" }],
        },
      ]
    );
    expect(memory.Josh).toContain("Where do you live? — Brisbane");
  });

  test("selects only records connected to current participants", () => {
    const profiles = new Set(["josh", "bella"]);
    const questions = new Set(["q-current"]);
    expect(belongsToExperiment({ profileId: "bella", id: "q-current" }, profiles, questions)).toBe(true);
    expect(belongsToExperiment({ profileId: "other", questionId: "q-current" }, profiles, questions)).toBe(true);
    expect(belongsToExperiment({ senderProfileId: "other", receiverProfileId: "josh" }, profiles, questions)).toBe(true);
    expect(belongsToExperiment({ profileId: "other", questionId: "q-old" }, profiles, questions)).toBe(false);
  });

  test("permits reset only against local Azurite", () => {
    expect(isLocalAzurite("UseDevelopmentStorage=true")).toBe(true);
    expect(isLocalAzurite("DefaultEndpointsProtocol=https;AccountName=production")).toBe(false);
  });

  test("configures reset storage from the local environment before connecting", async () => {
    vi.stubEnv("AzureWebJobsStorage", "UseDevelopmentStorage=true");
    const fromConnectionString = vi.spyOn(TableClient, "fromConnectionString");
    const unavailable = new Error("Azurite unavailable");
    vi.spyOn(TableClient.prototype, "createTable").mockRejectedValue(unavailable);

    await expect(resetExperiment(["participant"])).rejects.toThrow(unavailable);
    expect(fromConnectionString).toHaveBeenCalledWith("UseDevelopmentStorage=true", expect.any(String), {
      allowInsecureConnection: true,
    });
  });

  test("rejects non-local reset before creating a storage client", async () => {
    vi.stubEnv("AzureWebJobsStorage", "DefaultEndpointsProtocol=https;AccountName=production");
    const fromConnectionString = vi.spyOn(TableClient, "fromConnectionString");

    await expect(resetExperiment(["participant"])).rejects.toThrow("Experiment reset is allowed only for local Azurite runs");
    expect(fromConnectionString).not.toHaveBeenCalled();
  });
});

describe("LLM provider configuration", () => {
  test("throws an explanatory error listing options when no provider is set", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("LLM", "");
    expect(() => getLlmProvider()).toThrowError(/No LLM provider selected.*Available options:.*openvino.*ollama.*openai.*claude/s);
  });

  test("throws when an invalid provider is set", () => {
    vi.stubEnv("LLM_PROVIDER", "unsupported-llm");
    expect(() => getLlmProvider()).toThrowError(/Unknown LLM provider 'unsupported-llm'/);
  });

  test("resolves configured provider case-insensitively", () => {
    vi.stubEnv("LLM_PROVIDER", "OpenVINO");
    expect(getLlmProvider()).toBe("openvino");

    vi.stubEnv("LLM_PROVIDER", "Claude");
    expect(getLlmProvider()).toBe("claude");
  });

  test("assertLlmReady requires LLM_BASE_URL for ollama/openai", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("LLM_BASE_URL", "");
    await expect(assertLlmReady()).rejects.toThrow(/LLM_PROVIDER='ollama' requires 'LLM_BASE_URL'/);
  });
});

describe.skipIf(!process.env.AGENT_RUN)("agent chat run", () => {
  test("agents get to know each other through Q3", runAgentChat, 60 * 60 * 1000);
});
