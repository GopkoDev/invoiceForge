# Docs site

This site shows the Markdown files in `docs/` as web pages. It uses [VitePress](https://vitepress.dev). The site reads the files where they are. You do not move or change a file to show it here.

## Start the site

1. Start the local server: `pnpm docs:dev`.
2. Open the address that the command shows (usually `http://localhost:5173`).
3. Change a file in `docs/`. The page updates automatically.

To make the static site, use `pnpm docs:build`. The output goes to `docs/.vitepress/dist`. To look at the output, use `pnpm docs:preview`.

## Pages

| Page | File | Function |
|---|---|---|
| Home | `docs/index.md` | Shows the project description and the changelog in two columns |
| Description | `docs/description.md` | Describes the project in ASD-STE100 style |
| Changelog | `docs/changelog.md` | Shows the planned work, the work in progress and the shipped features |
| Architecture map | `docs/architecture-map.md` | Shows the current structure of the code |
| Features | `docs/features/<feature>/` | One folder for each feature: spec, SAD, ADRs, contracts, tasks |
| OpenAPI | `docs/features/<feature>/contracts/openapi.yaml` | Shows the API contract of a feature at `/api/<feature>` |

## Sidebar

- The sidebar shows the folder tree of `docs/`. A new file or folder shows in the sidebar automatically.
- The first heading (`#`) of a file is its name in the sidebar.
- The features show in the order of the changelog. The newest feature is at the top.
- Each feature shows its status: shipped, in progress or to do. The status comes from the section of the changelog that has a link to the feature folder.
- If the changelog does not have a link to a feature, the feature shows at the bottom, without a status.

## Add a feature

1. Make a folder in `docs/features/`, for example `docs/features/my-feature/`.
2. Add the Markdown files of the feature to the folder.
3. Add the feature to `docs/changelog.md`, in the section **To do**. Put a link to a file in the feature folder.
4. When the work starts, move the feature to **In progress**.
5. When the work is merged, move the feature to **Shipped**. Write the date and the pull request number.

The sidebar and the home page show the new status after each step.

## Diagrams

- Write diagrams in code blocks with the language `mermaid`. The site draws them.
- Click a diagram to open it full screen.
- In full screen, use the mouse wheel or the **+** and **−** buttons to zoom. Drag to move the diagram.
- Use **Fit** or double-click to show all of the diagram. Use **✕** or Esc to close.

## API contracts

- The site makes a page for each `contracts/openapi.yaml` file. The page shows the endpoints, the schemas and the examples.
- The page is in the sidebar of the feature, in the group **Contracts**, with the name **OpenAPI**.
- If the YAML is not valid, the page shows the error. The other pages continue to work.

## Links

- A link to a Markdown file in `docs/` opens the page on this site.
- A link to a file out of `docs/` opens the file on GitHub, on the branch `main`. Examples: `CONTEXT.md`, migration files.
- A link to a folder without an `index.md` file opens the folder on GitHub.

## Rules for Markdown files

- The site shows raw HTML as text. Thus, you can write `<id>` or `<key>` in the text. The site does not read it as a tag.
- Only `docs/index.md` and the pages in `docs/api/` can use HTML and Vue components.
- Use relative links (`./spec.md`, `../adr/`). The site and GitHub both resolve them.

## Configuration files

| File | Function |
|---|---|
| `docs/.vitepress/config.mts` | Site settings, sidebar, top menu, search |
| `docs/.vitepress/features-timeline.ts` | Reads the order and the status of the features from the changelog |
| `docs/.vitepress/repo-links.ts` | Changes links to files out of `docs/` into GitHub links |
| `docs/.vitepress/escape-html.ts` | Shows raw HTML as text |
| `docs/.vitepress/theme/index.ts` | Adds the OpenAPI components and the diagram zoom to the theme |
| `docs/.vitepress/theme/diagram-zoom.ts` | Opens a diagram full screen |
| `docs/.vitepress/theme/custom.css` | Styles for the home page and the diagram zoom |
| `docs/api/[feature].paths.ts` | Finds the OpenAPI files and makes one page for each |
