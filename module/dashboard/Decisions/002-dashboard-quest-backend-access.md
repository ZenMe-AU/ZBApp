# Dashboard Access to the Quest Backend

- Status: Accepted
- Date: 2026-11-15

## Context

The Dashboard runs inside the network and has direct access to the databases, like the Quest backend. It needs access to current Quest data without weakening the security of the Quest API.

## Decision

- The Dashboard must instantiate the Quest backend internally, in the same process, and may bypass API security through this internal access.
- Do not add any mechanism to bypass security on the Quest API itself. Such a mechanism could also be used by others.
- The Dashboard has direct database access within the network, like the Quest backend.

## Consequences

The Dashboard's internal integration is distinct from access through the Quest API; the API's security boundary must remain intact. This decision describes the target architecture, not a claim that the current Dashboard already implements it.
