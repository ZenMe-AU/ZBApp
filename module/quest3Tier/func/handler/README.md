

## Design decisions
1. The handler folder should not have any data storage related dependencies, e.g. data storage must go through the Repository and must use an interface that's defined for the repository independent of the data storage backend used. For example sequelize or datatables dependencies must only exist in the repository and not in other areas of the project.

## Q5Eg-compatible HTTP contract

The registrations in [route.mts](../route.mts) expose the Q5Eg question command
and query paths, with these intentional identity differences:

- `GET questionQry/getQuestions` and `GET questionQry/getSharedQuestions` have no
  caller profile ID parameter.
- The authenticated token's external ID is resolved to a local profile by
  `requestHandler`. Commands use that authenticated profile, not a body
  `profileId` or an `x-profile-id` header. Recipient IDs remain target identifiers.
- Question path parameters are named `questionId`; answer lookup takes `answerId`.
- Updates accept JSON Patch arrays (`application/json-patch+json`) and replacement
  objects (`application/json`).
- `GET questionQry/getQuestionShareEvents/{correlationId}` and
  `GET questionQry/getFollowUpEvents/{correlationId}` return `return.qty`.
  The existing generic event lookup and extra profile/legacy endpoints remain.

The five command response schemas now declare
`{ success: true, return: { messageId: "<uuid>" } }`, matching Q5Eg's acknowledgement
contract. **Backend implementation is deferred:** existing handlers still return
entity/action IDs or booleans, and no message IDs are fabricated or substituted.
Answer lookup by `answerId` alone uses `findAnswerById` on both repositories. The existing
Q3 UI client uses older URLs and has not been migrated in this route-contract pass.

## Question access

Handlers use the authenticated internal profile ID and the backend-independent
`QuestRepository` contract. Question detail, answer reads/writes, and sharing
require ownership or receipt of a share. Patch and update require ownership.
Failed permission checks return 403; storage
errors propagate without allowing the operation.

Answer detail resolves the stored question ID before checking access. Permitted
callers retain the existing answer-list contents and external author ID contract;
this change does not restore the historical owner/respondent-only answer filter.
These are API boundary checks, not database row-level security. Internal repository
callers must enforce their own actor scope, as required by the Dashboard plan.
