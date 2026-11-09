# Documentation

This folder contains all system, module, and API documentation.

# Architecture Guides

- System overview: [Overview.md](Overview.md)
- Architecture pattern index: [ArchitecturePatterns/README.md](ArchitecturePatterns/README.md)
- Side effect and idempotency guidance: [SideEffectIdempotency.md](SideEffectIdempotency.md)
- Data consistency decision: [Decisions/001-base-over-distributed-acid.md](Decisions/001-base-over-distributed-acid.md)

# How to deploy ZBREACTARCHITECTURE

How to deploy ZBREACTARCHITECTURE

1. Run `build.mjs` located inside of deploy > initenv

1. look for the dist folder in deploy > initenv and run `deployEnv.ps1`

1. place the .env file located inside the dist folder into the deploy folder

1. then run deploy.ps1 located in the deploy folder
   1. to run deploy.ps1 open a console inside the deploy folder directory and run deploy.ps1 (Warning this will take a while to finish, roughly an hour)

