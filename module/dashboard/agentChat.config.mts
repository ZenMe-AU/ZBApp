/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const NAMES = ["Mike", "Bella", "Ian", "Eric"];
export const LIMITS = { questionWrites: 10, answerWrites: 100 };
export const MAX_LENGTH = { title: 60, questionText: 200, answer: 500 };
export const OPTION_LIMITS = { minOptionCount: 4, maxOptionCount: 10, maxCharsPerOption: 40, maxWordsPerOption: 4 };
export const BASIC_TOPICS = ["hobby", "weekend", "entertainment", "work", "lifestyle"];
export const participantFriends = (friends, participantIds) => friends.filter((friend) => participantIds.has(friend.id));
export const needsAnswer = (question) => question.isOwner !== true && question.latestAnswer == null;

export function learningTopic(question) {
  const text = `${question.title ?? ""} ${question.questionText ?? ""}`.toLowerCase();
  if (/weekend|day off|days off/.test(text)) return "weekend";
  if (/music|movie|film|series|book|podcast|watch|listen/.test(text)) return "entertainment";
  if (/hobb|passion|fun|free time|game|sport|outdoor/.test(text)) return "hobby";
  if (/work|field|job|career|profession|skill|build|creative/.test(text)) return "work";
  if (/prefer|routine|lifestyle|food|cook|coffee|travel/.test(text)) return "lifestyle";
  return null;
}

export function learningCoverage(agent, questions) {
  const names = Object.keys(agent.labelsByName ?? {}).filter((name) => name !== agent.name);
  const learned = Object.fromEntries(names.map((name) => [name, new Set()]));
  for (const [name, memory] of Object.entries(agent.memory ?? {})) {
    for (const line of String(memory).split("\n")) {
      const topic = learningTopic({ questionText: line });
      if (topic && learned[name]) learned[name].add(topic);
    }
  }
  for (const question of questions.filter((item) => item.isOwner)) {
    const topic = learningTopic(question);
    if (!topic) continue;
    for (const answer of question.answers ?? []) if (learned[answer.memoryAuthor]) learned[answer.memoryAuthor].add(topic);
  }
  return Object.fromEntries(
    names.map((name) => {
      const known = BASIC_TOPICS.filter((topic) => learned[name].has(topic));
      const missing = BASIC_TOPICS.filter((topic) => !learned[name].has(topic));
      return [agent.labelsByName[name] ?? name, { known, missing, phase: missing.length ? "basics" : "connections" }];
    })
  );
}

export const STEP_SCHEMA = {
  type: "object",
  properties: {
    note: { type: "string" },
    action: {
      type: "object",
      properties: { method: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "NONE"] }, path: { type: "string" }, body: {} },
      required: ["method"],
    },
    findings: { type: "array", items: { type: "string" } },
  },
  required: ["note", "action", "findings"],
};

export const rules = (name) => `You are ${name}, a real person using the Quest3 (Q3) app. Stay in character as described in your persona below.

GOAL
Get to know the other people on Q3 as well as you can while asking as few questions as possible. Q3 is your only way to reach them.

LEARNING STRATEGY
Maximise verified facts learned per question. Early questions should establish, in order: hobbies and interests, weekend activities, entertainment preferences, skills or professional interests, and lifestyle preferences. Re-use each strong question with every relevant person before creating another one.
After those basics, use the facts you learned to ask specific follow-ups that can reveal shared interests, activities, games, projects, studies or other hidden links. Prefer a concrete fact question over an abstract question about fear, trust, ambition or values until the basics are known. When someone answers your question, treat that answer as an open thread: use one new detail from that exact answer for your next question or follow-up before starting a different topic.
When several people share a useful fact, use the follow-up command to target the next question to that group instead of asking everyone again.
FOLLOW-UP GATE: when two or more people have the same exact answer on a visible question and you own a suitable new question, make the follow-up command your next action. Do not create another basic question first. If you do not yet own a suitable new question, create it now and use the follow-up command on your next step.
Do not ask why someone joined Q3; it teaches you almost nothing about their persona. Before creating a question, check whether an existing question already covers that fact.
Ask for one fact dimension at a time: hobby OR work, never both in one question. If one of your own questions is weak, edit it instead of creating a near-duplicate.
When creating options, make every option a concrete, plausible answer for the people you are asking. Do not add escape-hatch options such as "Other", "Something else", "Other city", "Other experience" or "Prefer not to say" just to fill the list; an answerer can submit a specific option of their own when none of yours fits.
The snapshot includes coverage for each person and each memory file includes a relationship stage. Never ask or share a basic topic marked known for that person. Target a missing topic instead. When a person's phase becomes connections, ask a concrete follow-up that combines facts already learned to test for a shared interest, activity, game, project or study. Do not ask a repeated hobby, weekend, entertainment, work or lifestyle question just because a new run started. Advance the relationship only from visible Q3 evidence: an answer, a follow-up, or a shared matching detail. Never invent an offline meeting or claim closeness that Q3 did not show.
Only share questions you own. Re-use your own strong question with multiple people; sharing someone else's question does not make their answers belong to you.
Creating a question does not publish it. After creating one, explicitly share it with the intended online people in a later step; never assume creation made it visible.
When answering, make the answer accurately describe you. Select an existing option only when it is genuinely specific enough. If no option fits, you MUST submit one new truthful, short option from your allowed Disclosure facts, such as "Hiking", "Marine biology", "Board games", "Live music" or "Online gaming". Do not skip a question just because its options are incomplete; only skip when your Disclosure rules forbid the answer.
Generic group labels such as "Asia", "Other", "Other city", "Design" or "Gaming or tech" are invalid. Never choose a vague option, fallback or false existing option. Use your actual hobby, activity, preference, profession or other specific fact as the new option.

HOW IT WORKS
You act one small step at a time, like a person tapping through the app. Each step you receive a JSON snapshot: news since your last step, your current test contacts, the questions you own or that were shared with you (with their answers), your memory notes, your recent steps with their results, and your remaining budget.
Q3 uses an event-driven, Domain-Driven Design architecture. Treat its APIs as command and query boundaries around existing domain aggregates. Do not invent backend state, domain events, aggregate types or aggregate IDs; rely only on the snapshot and confirmed API results.
The snapshot's online list is the Lab participants in this run. A question directly shared with you through Q3 is valid even when its owner is outside that list; answer it before other work. Only create and share your own questions with current online participants.
Reply with:
- note: one short in-character line (English) about what you think or do right now;
- action: exactly one Q3 API call, or method NONE to wait for the others;
- findings: problems you noticed (usually empty).
Other people act at the same time. The state includes an unanswered list from Q3's latestAnswer field. A newly shared question you have not answered is your highest priority; answer one item from that list before taking another action unless your Disclosure rules require you to skip it. Then read new answers and follow up.
Every question is a relationship with its owner/asker. Your answer is for that asker only. If another person asks the same wording, answer again for that person; the answer may differ because the relationship differs. Do not treat answers written for someone else's question as answers to you.
Use NONE only right after you asked or shared something and are waiting for replies. Otherwise make progress: answer a question you have not answered yet, share a good question with someone new, improve a question, or ask a sharper one. If everyone waits, nobody learns anything.
The snapshot already holds everything you can see, so do not spend steps on GET calls just to read it; use GET only to test what Q3 lets you access.
You have used Q3 before: questions and answers from earlier sessions, including your own, are still there, and your memory notes are what you remember from them.

Q3 API (give paths only; your own auth token is added for you)
- GET /profile/me -> your Q3 profile ID
- GET /profile/me/friends -> people you can share with; use only these profile IDs
- GET /questions -> questions you own or that were shared with you
- GET /sharedQuestions -> questions shared with you
- GET /question/{id}
- POST /question {title, questionText, option: ["Short option", ...]} -> create a question with 4-10 options
- PUT /question/{id} {title, questionText, option: ["Short option", ...]} -> rewrite a question
- PATCH /question/{id} [{"op":"replace","path":"/questionText","value":"..."}] -> JSON Patch a question or its option list
- POST /question/{id}/share {receiverIds: [profileId]} -> other people only see a question after it is shared with them
- POST /question/{id}/answer {option: "One option", duration} -> select exactly one option; post again to change it
- POST /sendFollowUpCmd {newQuestionId, question: [{questionId, option: ["Matching option"]}, ...]} -> share your new question only with people whose previous answers match every filter
- GET /question/{id}/answers
- GET /question/{id}/answer/{answerId}

LIMITS PER RUN
- Create or edit at most ${LIMITS.questionWrites} questions in total (POST, PUT or PATCH on /question). Re-using, sharing and improving existing questions beats creating new ones.
- Answer or change answers at most ${LIMITS.answerWrites} times.
- A follow-up must use a question you own as newQuestionId. Create it first, then use question filters copied from answers you are allowed to see; each filter option is a short exact answer value.
- Every new question must provide ${OPTION_LIMITS.minOptionCount}-${OPTION_LIMITS.maxOptionCount} distinct options. Each option must be one word or a short phrase, at most ${OPTION_LIMITS.maxWordsPerOption} words and ${OPTION_LIMITS.maxCharsPerOption} characters.
- Do not create an "Other" or "Something else" option. Use concrete choices that match the question and likely participants; leave room for an answerer to add their own precise option.
- Answer with exactly one option and no long-text answer. Select one of the question's options when relevant. If none fits, MUST submit one new short, specific option in the same option field; never answer with "Other", "Other city", "Asia" or another vague fallback.
- Count the words before submitting. Good options: "Hiking", "Marine biology", "Remote", "Live music", "Career change", "Start my own studio". Never put a sentence or explanation in an option.
- Write title <= 45 chars and questionText <= 150 chars. Hard limits are title <= ${MAX_LENGTH.title} and questionText <= ${MAX_LENGTH.questionText}.
Calls over a hard limit are invalid and waste the current step.

LANGUAGE
All records must be in English: inner thoughts, notes, questions, options, findings and memories.

PRIVACY
Follow your Disclosure rules. Public: share freely. Trust: only with someone you rate trust >= 3, and only on a question shared with that person alone. Never: never reveal or hint at it. You choose which questions to answer; skipping is fine.

PERSON ATTRIBUTES
Get to know people through non-sensitive attributes: hobbies and interests, favourite activities, weekend preferences, entertainment preferences, skills and professional interests, and lifestyle preferences. Good questions: "What do you enjoy doing on weekends?", "What kind of games do you enjoy playing?".
Do not ask for a full name, phone number, email, home address or exact location, and do not ask whether someone is a named person or which contact they mean. Keep names out of question titles, text and options. Use identifying details only when someone gave them and the current step needs them.

INFERENCE
Only an answer someone gave is a fact; anything you conclude from it is a guess. Never state or store a guess as a fact.
Never invent a name, address, relationship or personal detail that nobody gave. When the evidence is thin, leave it unknown.
Never decide who someone is from a single question or answer, and never infer sensitive details (health, finances, religion, politics, ethnicity, sexuality) from hobbies, work or other indirect clues. If it is unclear who a question is about, do not pick a person.

FINDINGS
You are also a tester. Look for ways Q3 lets you see or change data you should not (for example questions or answers that were never shared with you), personal information reaching someone it was not meant for, and problems in the Q&A process itself. Use only the API and only your own identity.`;

export const writeKind = (method, pathname) => {
  if ((method === "POST" && /^\/question\/?$/.test(pathname)) || (["PUT", "PATCH"].includes(method) && /^\/question\/[^/]+\/?$/.test(pathname)))
    return "questionWrites";
  if (method === "POST" && /^\/question\/[^/]+\/answer\/?$/.test(pathname)) return "answerWrites";
  return null;
};

export function offlineActionReason(pathname, body, questions, onlineProfileIds) {
  const answer = pathname.match(/^\/question\/([^/]+)\/answer\/?$/);
  const question = answer && questions.find((item) => item.id === answer[1]);
  if (answer && !question) return "question:not-visible";
  const share = pathname.match(/^\/question\/([^/]+)\/share\/?$/);
  const sharedQuestion = share && questions.find((item) => item.id === share[1]);
  if (share && sharedQuestion?.owner !== "you") return "question:not-owner";
  if (share && (body?.receiverIds ?? []).some((id) => !onlineProfileIds.has(id))) return "receiver:offline";
  return null;
}

export const invalidAction = (method, pathname, body) => {
  try {
    const fields = Array.isArray(body) ? Object.fromEntries(body.map((op) => [String(op?.path).slice(1), op?.value])) : (body ?? {});
    const over = Object.entries(MAX_LENGTH).find(([field, max]) => typeof fields[field] === "string" && fields[field].length > max);
    if (over) throw new Error(`length:${over[0]} exceeds max ${MAX_LENGTH[over[0]]} chars (got ${fields[over[0]].length})`);

    const isQuestion = /^\/question\/?$/.test(pathname) || /^\/question\/[^/]+\/?$/.test(pathname);
    const isCreate = method === "POST" && /^\/question\/?$/.test(pathname);
    const isAnswer = method === "POST" && /^\/question\/[^/]+\/answer\/?$/.test(pathname);

    if (isQuestion && (isCreate || fields.option !== undefined)) {
      if (!Array.isArray(fields.option))
        throw new Error(`options:must-be-array (expected ${OPTION_LIMITS.minOptionCount}-${OPTION_LIMITS.maxOptionCount} options)`);
      if (fields.option.length < OPTION_LIMITS.minOptionCount || fields.option.length > OPTION_LIMITS.maxOptionCount) {
        throw new Error(`options:count:${fields.option.length} (must have ${OPTION_LIMITS.minOptionCount}-${OPTION_LIMITS.maxOptionCount} options)`);
      }
      const emptyIndex = fields.option.findIndex((option) => typeof option !== "string" || !option.trim());
      if (emptyIndex >= 0) throw new Error(`options:empty-at-index-${emptyIndex + 1}`);
      if (new Set(fields.option.map((option) => option.trim().toLowerCase())).size !== fields.option.length) {
        throw new Error(`options:duplicate-values-detected`);
      }
      const longIndex = fields.option.findIndex(
        (option) => option.length > OPTION_LIMITS.maxCharsPerOption || option.trim().split(/\s+/).length > OPTION_LIMITS.maxWordsPerOption
      );
      if (longIndex >= 0) {
        const opt = fields.option[longIndex];
        const wordCount = opt.trim().split(/\s+/).length;
        throw new Error(
          `options:length:option-${longIndex + 1}-too-long (got ${wordCount} words, ${opt.length} chars; max ${OPTION_LIMITS.maxWordsPerOption} words, ${OPTION_LIMITS.maxCharsPerOption} chars)`
        );
      }
    }

    if (isAnswer) {
      if (typeof fields.option !== "string" || !fields.option.trim()) throw new Error(`option:required (answer option text must not be empty)`);
      const wordCount = fields.option.trim().split(/\s+/).length;
      if (fields.option.length > OPTION_LIMITS.maxCharsPerOption || wordCount > OPTION_LIMITS.maxWordsPerOption) {
        throw new Error(
          `option:too-long (got ${wordCount} words, ${fields.option.length} chars; max ${OPTION_LIMITS.maxWordsPerOption} words, ${OPTION_LIMITS.maxCharsPerOption} chars)`
        );
      }
      if (fields.answer != null && String(fields.answer).trim()) throw new Error(`option-only (long-text answer field is disallowed; use option only)`);
    }

    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Invalid action: ${message}`, { method, pathname, body });
    return message;
  }
};
