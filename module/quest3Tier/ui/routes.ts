/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import type { RouteConfig } from "@react-router/dev/routes";
import { route, index, layout } from "@react-router/dev/routes";

export const protectedRoutes = [
  route("quest3Tier", "../../module/quest3Tier/ui/routes/QuestionCombinationList.tsx"),
  route("/quest3Tier/:id", "../../module/quest3Tier/ui/routes/QuestionDetail.tsx"),
  route("/quest3Tier/:id/add", "../../module/quest3Tier/ui/routes/QuestionDetailAdd.tsx"),
  route("/quest3Tier/:id/answer", "../../module/quest3Tier/ui/routes/AnswerQuestion.tsx"),
  route("/quest3Tier/:id/followUp", "../../module/quest3Tier/ui/routes/FollowUpQuestion.tsx"),
  route("/quest3Tier/add", "../../module/quest3Tier/ui/routes/AddQuestion.tsx"),
  route("/quest3Tier/:id/edit", "../../module/quest3Tier/ui/routes/EditQuestion.tsx"),
  route("/quest3Tier/:id/share", "../../module/quest3Tier/ui/routes/ShareQuestion.tsx"),
  route("/quest3Tier/friends", "../../module/quest3Tier/ui/routes/ManageFriends.tsx"),
];
export const publicRoutes = [];
