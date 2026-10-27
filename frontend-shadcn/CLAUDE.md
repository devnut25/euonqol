# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server
npm run dev:host   # Vite dev server exposed on the LAN
npm run build      # tsc -b && vite build
npm run lint       # eslint
```

Path alias: `@/*` maps to `src/*`.

## Data Tables

`CrudDataTable` (`src/components/CrudDataTable.tsx`) and `CardListData` (`src/components/data-table/card-list-data.tsx`) are **fully server-side**: `useReactTable` runs with `manualPagination`, `manualSorting` and `manualFiltering` (`src/components/data-table/data-table.tsx`). Nothing is filtered, sorted or paginated in the browser — every toolbar interaction becomes a query param on the `url` request:

| UI | Column config | Query param sent |
|----|---------------|------------------|
| Search box (debounced) | `meta: { searchable: true }` | `search=<text>` |
| Column header sort | sorting enabled (TanStack default; disable with `enableSorting: false`) | `sort=<columnId>` / `sort=-<columnId>` |
| Toolbar filter | `meta: { filterable: true, filterVariant, filterEnum, filterMode? }` | `filter[<columnId>]=<value>` (array when `filterMode: 'multiple'`) |
| Pagination | — | `page`, `per_page` |
| Fixed scope | `params` / `defaultParams` props | merged into `filter[...]` / root params |

Column meta types: `src/types/table.d.ts`.

### Rule: every table control must be backed by the API
Because the table always renders whatever the API returns, a backend that ignores these params fails **silently**: the search box, sort arrows or filters look functional but change nothing (or, worse, always return an empty list). So:

- **Only mark a column `searchable` if the backend searches it.** The endpoint's model config (`backend/src/models/<Entity>.ts`) must list the field in `searchable`, or the service must add a custom relation search. One search input is rendered per searchable column, but the API receives a single `search` value applied to all backend `searchable` fields — label the column accordingly.
- **Sorting is on by default.** The sort key is the column `id`, so it must match a backend `sortable` field (or a `fieldMap` alias). Set `enableSorting: false` on columns the backend cannot sort (computed/relation/HTML columns, counters).
- **`filterable` columns** need the column `id` to be a filterable field on the backend (or extracted by the service, e.g. `questionnaireId` in `AssignmentService.getList`).
- **Check the backend in the same change.** When adding or changing `searchable` / sorting / `filterable` on a column, open the endpoint's controller → service → model config and confirm `req.query` is forwarded and handled. Backend rules: section "List Endpoints Backing Frontend Tables" in `backend/CLAUDE.md`.
- **Verify in the Network tab**: typing in the search box must produce `?search=<text>` and a smaller `meta.total`; an unknown string must show the empty state, not the full list.

`CardListData` with `columns=[]` (e.g. eligibility, closing messages) renders no search/filter inputs — only reload. Add columns there only if the endpoint supports the corresponding params.
