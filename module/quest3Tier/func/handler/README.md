

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
Answer lookup by `answerId` alone also still needs repository support. The existing
Q3 UI client uses older URLs and has not been migrated in this route-contract pass.
