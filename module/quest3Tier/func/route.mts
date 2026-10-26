/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import "./swagger/openapi.mjs";
import { app } from "@azure/functions";
import { requestHandler } from "./handler/handlerWrapper.mjs";
import { CreateQuestion } from "./handler/question/create.mjs";
import { GetQuestionById } from "./handler/question/getById.mjs";
import { GetQuestionListByUser } from "./handler/question/getListByUser.mjs";
import { PatchQuestionById } from "./handler/question/patchById.mjs";
import { UpdateQuestionById } from "./handler/question/updateById.mjs";
import * as CreateQuestionschema from "./handler/question/CreateQuestion.mjs";
import * as GetQuestionByIdsc from "./handler/question/GetQuestionById.mjs";
import * as UpdateQuestionByIdsc from "./handler/question/UpdateQuestionById.mjs";
import * as PatchQuestionByIdsc from "./handler/question/PatchQuestionById.mjs";
import * as AddAnswer from "./handler/answer/AddAnswer.mjs";
import * as GetAnswerById from "./handler/answer/GetAnswerById.mjs";
import * as GetQuestionListByUsersc from "./handler/question/GetQuestionListByUser.mjs";
import * as GetAnswerListByQuestionId from "./handler/answer/GetAnswerListByQuestionId.mjs";
import * as ShareQuestion from "./handler/share/ShareQuestion.mjs";
import * as GetSharedQuestionList from "./handler/share/GetSharedQuestionList.mjs";
import * as SendFollowUpCmd from "./handler/followup/SendFollowUpCmd.mjs";
import * as ShareQuestionCmd from "./handler/share/ShareQuestionCmd.mjs";
import * as getEventByCorrelationId from "./handler/getEventByCorrelationId.mjs";
import { GetAnswerById as getAnswerByIdHandler } from "./handler/answer/GetAnswerById.mjs";
import { GetAnswerListByQuestionId as getAnswerListByQuestionIdHandler } from "./handler/answer/GetAnswerListByQuestionId.mjs";
import { GetEventByCorrelationId as getEventByCorrelationIdHandler } from "./handler/getEventByCorrelationId.mjs";
import { SendFollowUpCmd as sendFollowUpCmdHandler } from "./handler/followup/SendFollowUpCmd.mjs";
import { ShareQuestionCmd as shareQuestionCmdHandler } from "./handler/share/ShareQuestionCmd.mjs";
import { ShareQuestionById as shareQuestionByIdHandler } from "./handler/share/ShareQuestion.mjs";
import { GetSharedQuestionListByUser as getSharedQuestionListByUserHandler } from "./handler/share/GetSharedQuestionList.mjs";
import profileHandler from "./handler/profileHandler.mjs";
import * as Profile from "./handler/Profile.mjs";
import { updateMyProfileSchema } from "./handler/updateMyProfileSchema.mjs";

//TODO: Review schema usage and ensure all endpoints have a correct schema assigned which is also in sync with the relevant function and relevant swagger doc.

app.openAPIPath("CreateQuestion", "Create a question", {
  route: "question",
  methods: ["POST"],
  authLevel: "anonymous",
  tags: ["Question"],
  body: CreateQuestionschema.body,
  responses: CreateQuestionschema.responses,
  handler: requestHandler(CreateQuestion, {
    schemas: [CreateQuestionschema.body],
  }),
});

app.openAPIPath("GetQuestionById", "Get a question by ID", {
  route: "question/{id}",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Question"],
  params: GetQuestionByIdsc.params,
  responses: GetQuestionByIdsc.responses,
  handler: requestHandler(GetQuestionById, {
    params: GetQuestionByIdsc.params,
  }),
});

app.openAPIPath("UpdateQuestionById", "Update a question", {
  route: "question/{id}",
  methods: ["PUT"],
  authLevel: "anonymous",
  tags: ["Question"],
  params: UpdateQuestionByIdsc.params,
  body: UpdateQuestionByIdsc.body,
  responses: UpdateQuestionByIdsc.responses,
  handler: requestHandler(UpdateQuestionById, {
    params: UpdateQuestionByIdsc.params,
    schemas: [UpdateQuestionByIdsc.body],
  }),
});

app.openAPIPath("PatchQuestionById", "Update a question using JSON Patch", {
  route: "question/{id}",
  methods: ["PATCH"],
  authLevel: "anonymous",
  tags: ["Question"],
  request: {
    params: PatchQuestionByIdsc.params,
    body: { content: { "application/json-patch+json": { schema: PatchQuestionByIdsc.body } } },
  },
  responses: PatchQuestionByIdsc.responses,
  handler: requestHandler(PatchQuestionById, {
    params: PatchQuestionByIdsc.params,
    schemas: [PatchQuestionByIdsc.body],
  }),
});

app.openAPIPath("AddAnswer", "Answer a question", {
  route: "question/{id}/answer",
  methods: ["POST"],
  authLevel: "anonymous",
  tags: ["Answer"],
  params: AddAnswer.params,
  body: AddAnswer.body,
  responses: AddAnswer.responses,
  handler: requestHandler(AddAnswer.AddAnswer, {
    params: AddAnswer.params,
    schemas: [AddAnswer.body],
  }),
});

app.openAPIPath("GetAnswerById", "Get an answer by ID", {
  route: "question/{id}/answer/{answerId}",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Answer"],
  params: GetAnswerById.params,
  responses: GetAnswerById.responses,
  handler: requestHandler(getAnswerByIdHandler, {
    params: GetAnswerById.params,
  }),
});

app.openAPIPath("GetQuestionListByUser", "List questions created by or shared with the caller", {
  route: "questions",
  methods: ["GET"],
  authLevel: "anonymous",
  responses: GetQuestionListByUsersc.responses,
  handler: requestHandler(GetQuestionListByUser)
});

app.openAPIPath("GetAnswerListByQuestionId", "List answers to a question", {
  route: "question/{id}/answers",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Answer"],
  params: GetAnswerListByQuestionId.params,
  responses: GetAnswerListByQuestionId.responses,
  handler: requestHandler(getAnswerListByQuestionIdHandler, {
    params: GetAnswerListByQuestionId.params,
  }),
});

app.openAPIPath("ShareQuestion", "Share a question", {
  route: "question/{id}/share",
  methods: ["POST"],
  authLevel: "anonymous",
  tags: ["Share"],
  params: ShareQuestion.params,
  body: ShareQuestion.body,
  responses: ShareQuestion.responses,
  handler: requestHandler(shareQuestionByIdHandler, {
    params: ShareQuestion.params,
    schemas: [ShareQuestion.body],
  }),
});

app.openAPIPath("GetSharedQuestionList", "List questions shared with the caller", {
  route: "sharedQuestions",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Share"],
  responses: GetSharedQuestionList.responses,
  handler: requestHandler(getSharedQuestionListByUserHandler),
});

app.openAPIPath("GetMyProfile", "Get the caller's profile", {
  route: "profile/me",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Profile"],
  responses: Profile.getMyProfileResponses,
  handler: requestHandler(profileHandler.GetMyProfile),
});

app.openAPIPath("UpdateMyProfile", "Update the caller's profile", {
  route: "profile/me",
  methods: ["PUT"],
  authLevel: "anonymous",
  tags: ["Profile"],
  body: Profile.updateMyProfileBody,
  responses: Profile.updateMyProfileResponses,
  handler: requestHandler(profileHandler.UpdateMyProfile, {
    schemas: [updateMyProfileSchema],
  }),
});

app.openAPIPath("AddMyFriend", "Add a friend to the caller's profile", {
  route: "profile/me/friends/{id}",
  methods: ["PUT"],
  authLevel: "anonymous",
  tags: ["Profile"],
  params: Profile.addMyFriendParams,
  responses: Profile.addMyFriendResponses,
  handler: requestHandler(profileHandler.AddMyFriend, {
    params: Profile.addMyFriendParams,
  }),
});

app.openAPIPath("GetMyFriends", "List the caller's friends", {
  route: "profile/me/friends",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Profile"],
  responses: Profile.getMyFriendsResponses,
  handler: requestHandler(profileHandler.GetMyFriends),
});

app.openAPIPath("SendFollowUpCmd", "Send a follow-up question to matching respondents", {
  route: "sendFollowUpCmd",
  methods: ["POST"],
  authLevel: "anonymous",
  tags: ["Command"],
  headers: SendFollowUpCmd.headers,
  body: SendFollowUpCmd.body,
  responses: SendFollowUpCmd.responses,
  handler: requestHandler(sendFollowUpCmdHandler, {
    schemas: [SendFollowUpCmd.body],
  }),
});

app.openAPIPath("ShareQuestionCmd", "Share a question with profiles", {
  route: "shareQuestionCmd",
  methods: ["POST"],
  authLevel: "anonymous",
  tags: ["Command"],
  headers: ShareQuestionCmd.headers,
  body: ShareQuestionCmd.body,
  responses: ShareQuestionCmd.responses,
  handler: requestHandler(shareQuestionCmdHandler, {
    schemas: [ShareQuestionCmd.body],
  }),
});

app.openAPIPath("getEventByCorrelationId", "Count events recorded for a command", {
  route: "getEventByCorrelationId/{name}/{correlationId}",
  methods: ["GET"],
  authLevel: "anonymous",
  tags: ["Command"],
  params: getEventByCorrelationId.params,
  responses: getEventByCorrelationId.responses,
  handler: requestHandler(getEventByCorrelationIdHandler, {
    params: getEventByCorrelationId.params,
  }),
});
