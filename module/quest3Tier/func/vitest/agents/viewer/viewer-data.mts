/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const AGENTS = ["Mike", "Bella", "Ian", "Eric"];
export const KINDS = {
  answer: ["Answer posted", "Answer"],
  edit: ["Question refined", "Edit"],
  error: ["Action failed", "Error"],
  finding: ["Finding raised", "Finding"],
  followup: ["Follow-up sent", "Follow-up"],
  memory: ["Memory updated", "Memory"],
  note: ["Private observer note", "Thought"],
  question: ["Question created", "Question"],
  read: ["Q3 checked", "Read"],
  share: ["Question shared", "Share"],
  start: ["Run started", "System"],
  system: ["Run status", "System"],
};

export const VIEWS = {
  network: { title: "People & friends", kinds: [] },
  overview: { title: "Run overview", kinds: [] },
  relationships: { title: "Relationship accuracy", kinds: [] },
  questions: { title: "Questions", kinds: [] },
  followups: { title: "Follow-ups", kinds: ["followup"] },
  findings: { title: "Findings", kinds: ["finding", "error"] },
  activity: { title: "Activity", kinds: null, reverse: true },
};

export function questionTopic(question) {
  const text = `${question.title} ${question.text}`.toLowerCase();
  if (/where|city|region|based|live/.test(text) && /work|field|job|career/.test(text)) return "Work and place";
  if (/where|city|region|based|location/.test(text)) return "Location";
  if (/work|field|job|career|build|creative/.test(text)) return "Work";
  if (/live with|household|family|parent|partner|children/.test(text)) return "Home and family";
  if (/hobb|fun|free time|weekend|game|sport|outdoor/.test(text)) return "Interests";
  if (/proud|fear|change|learn|matter|lose|future|turning point/.test(text)) return "Values and change";
  return "Other";
}

export function parseLine(line, people = AGENTS) {
  const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+([\s\S]+)$/);
  if (!match) return null;
  const [, time, body] = match;
  const start = body.match(/^Run starts\. Online: (.+)\.$/);
  if (start) return { time, agent: null, kind: "start", text: body, participants: start[1].split(", ") };
  const agent = people.find((name) => body.startsWith(`${name} `) || body.startsWith(`${name}:`));
  if (!agent) {
    const text = body.startsWith("Report:") ? `Report saved: ${body.split(/[\\/]/).at(-1)}` : body;
    return { time, agent: null, kind: "system", text };
  }
  const message = body.slice(agent.length).trimStart();
  if (message.startsWith("FINDING:")) return { time, agent, kind: "finding", text: message.slice(8).trim() };
  if (message.startsWith("followed up ")) return { time, agent, kind: "followup", text: message };
  if (message.startsWith(":")) {
    const raw = message.slice(1).trim();
    const text = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    return { time, agent, kind: "note", text };
  }
  const kinds = { answered: "answer", edited: "edit", asked: "question", shared: "share" };
  const verb = Object.keys(kinds).find((key) => message.startsWith(`${key} `));
  if (verb) {
    const questionId = message.match(/\[q:([^\]]+)\]/)?.[1];
    return { time, agent, kind: kinds[verb], text: message.replace(/\s*\[q:[^\]]+\]\s*/, " "), ...(questionId && { questionId }) };
  }
  if (message.startsWith("looked at ")) return { time, agent, kind: "read", text: message };
  if (message.startsWith("updated memory:")) return { time, agent, kind: "memory", text: message };
  if (message.startsWith("tried ") || message.includes(" failed") || message.includes(" error") || message.includes("stops after")) {
    return { time, agent, kind: "error", text: message };
  }
  return { time, agent, kind: "system", text: message };
}

export const parseLog = (text) => {
  const participants = text.match(/Run starts\. Online: (.+)\./)?.[1].split(", ") ?? [];
  const people = [...new Set([...AGENTS, ...participants])];
  return text
    .split(/(?=^\[\d{2}:\d{2}:\d{2}\]\s)/m)
    .map((event) => parseLine(event.trimEnd(), people))
    .filter(Boolean);
};

export function classifyFinding(text) {
  if (/security|privacy|permission|unauthori[sz]ed|access|expos|leak|boundary/i.test(text)) return "Security";
  if (/null|missing|corrupt|integrity|misattrib|duplicate|wrong profile/i.test(text)) return "Data";
  if (/timeout|error|failed|connection|refused|unavailable|render/i.test(text)) return "Runtime";
  return "Process";
}

const tableRows = (text, heading, nextHeading) => {
  const section = text.match(new RegExp(`${heading}\\n\\n([\\s\\S]*?)(?=\\n\\n${nextHeading})`))?.[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("| Agent |") && !line.includes("| Observer |"))
    .map((line) =>
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replaceAll("\\|", "|"))
    );
};

export function parseReport(text) {
  const profileIds = Object.fromEntries(tableRows(text, "## Participant profiles", "## Metrics").filter(([name, id]) => name !== "Participant" && id).map(([name, id]) => [name, id]));
  const metrics = tableRows(text, "## Metrics", "## Judge");
  const json = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };
  const pairs = tableRows(text, "## Judge", "### Leaks").map((row) => {
    const [observer, subject, accuracy, links] = row;
    const detailed = row.length >= 9;
    return {
      observer,
      subject,
      accuracy: Number(accuracy),
      links,
      detailsAvailable: detailed,
      correctFacts: detailed ? json(row[4], []) : [],
      incorrectFacts: detailed ? json(row[5], []) : [],
      missingFacts: detailed ? json(row[6], []) : [],
      memory: detailed ? json(row[7], "") : "",
      note: detailed ? row[8] : row[4],
    };
  });
  const leaks = (text.match(/### Leaks\n\n([\s\S]*?)(?=\n\n## )/)?.[1] ?? "").split("\n\n").filter((line) => line.startsWith("- ") && line !== "- none");
  const total = (index) => metrics.reduce((sum, row) => sum + (Number(row[index]) || 0), 0);
  const detailedMetrics = (metrics[0]?.length ?? 0) >= 12;
  const answered = metrics.reduce((sum, row) => sum + (Number(row[6]?.split("/")[0]) || 0), 0);
  const seen = metrics.reduce((sum, row) => sum + (Number(row[6]?.split("/")[1]) || 0), 0);
  const questionSection = text.match(/## Questions \(final\)\n\n([\s\S]*?)(?=\n\n## Call log)/)?.[1] ?? "";
  const questions = questionSection
    .split(/\n\n(?=### )/)
    .map((block) => {
      const separator = block.indexOf("\n\n");
      const heading = separator < 0 ? block : block.slice(0, separator);
      const body = separator < 0 ? "" : block.slice(separator + 2);
      const current = heading.match(/^### (.+) \(id ([^;]+); owner (.+)\)$/);
      const legacy = heading.match(/^### (.+) \(owner (.+)\)$/);
      if (!current && !legacy) return null;
      const lines = body.split("\n").filter(Boolean);
      const answers = lines.filter((line) => line.startsWith("- ")).map((line) => {
        const value = line.slice(2);
        const match = value.match(/^(\(edited\) )?([^:]+):\s(.+)$/);
        return match ? { author: match[2], text: `${match[1] ?? ""}${match[3]}` } : { author: "Unknown", text: value };
      });
      return {
        ...(current && { id: current[2] }),
        title: current?.[1] ?? legacy[1],
        owner: current?.[3] ?? legacy[2],
        text: lines.find((line) => !line.startsWith("- ")) ?? "",
        answers,
      };
    })
    .filter(Boolean);
  return {
    profileIds,
    pairs,
    leaks,
    average: pairs.length ? pairs.reduce((sum, pair) => sum + pair.accuracy, 0) / pairs.length : null,
    questions: total(2),
    edits: total(3),
    reshares: total(5),
    answered,
    seen,
    answerSubmissions: total(7),
    answerChanges: detailedMetrics ? total(8) : Math.max(0, total(7) - answered),
    invalid: total(detailedMetrics ? 9 : 8),
    apiErrors: total(detailedMetrics ? 10 : 9),
    llmErrors: total(detailedMetrics ? 11 : 10),
    questionList: questions,
  };
}
