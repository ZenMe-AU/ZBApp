# Zenblox React Architecture

Welcome to the **Zenblox React Architecture** repository.

This project provides a **modular React UI framework** intended as a solid foundation for building new React-based web systems. The architecture demonstrates a variety of advanced patterns that may be required for global-scale, government, or enterprise-level applications.

> **Status** _Pre-Alpha_  
> Please note that this environment is currently in a pre-alpha state. It is intended primarily for learning, experimentation, and prototyping. You may encounter breaking changes as development progresses.

We invite you to explore the code and adapt the architectural patterns for your own use cases.

**Coming Soon**  
As the foundation matures, we plan to publish a fully working sample environment along with improved documentation and guides.

---

**Running Locally**  
To run this code on your local computer you need to do the following:

The root tooling and accessManager backend use TypeScript 6.0.3 or a compatible
6.x release. Keep the root `typescript-eslint` dependency at 8.71.2 or newer for
TypeScript 6 support.

1. Check out the code to a local folder
2. Open the folder in VSCode as a workspace, this is a monorepo and scripts require to be run from a workspace.
3. In a terminal run `deployLocalDependencies.bat` in the root folder. If components are installed, you must restart VSCode.
4. In a terminal run `pnpm install -g azure-functions-core-tools`
5. In a terminal run `pnpm setup`
6. In a terminal within `./module/quest3Tier/func` run `pnpm exec sequelize-cli db:migrate`
7. Open the VSCode "Run and Debug" menu, and start the task: "Start Fullstack App (workspace)"
8. If any commands are not found, restart VSCode or your computer and run `deployLocalDependencies.bat` again to confirm that no depdencies are missing.
9. If the above has errors, go to the individual READMe.md files in each of the following folder to run them individually: \ui, \modules\
