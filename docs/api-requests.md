# API requests from the frontend

`docs/api/openapi.json` does not exist yet and `shared/src/api-client/schema.d.ts` is still a placeholder, so Phase F0 runs on an MSW mock
(`frontend/admin/src/mocks`) that follows the zod schemas in `shared/src/schemas`. When the spec lands, `frontend/admin/src/features/api/http.ts`
is replaced by the generated client and the mock handlers are checked against it. Nothing under backend or shared was edited.

## Endpoints the F0 screens assume (please confirm or correct)

| Method and path | Used by | Notes |
| --- | --- | --- |
| POST /auth/login | Login | body `loginBody`, returns `loginResponse`, sets httpOnly refresh cookie |
| POST /auth/refresh | Quiet refresh, page reload | cookie only, returns `refreshResponse`. 401 when no session |
| POST /auth/logout | Sign out | clears cookie |
| POST /auth/forgot-password | Forgot password | body `{ email }`. Always 200 so emails are not revealed |
| GET /auth/sessions | Profile | array of `sessionDto` |
| GET /me | Menus and permissions | `meResponse` |
| GET /settings/gst-status | GST mode | `gstStatus`. Also inside `/me`, so the app reads it once from there |
| GET, PUT /settings/business-profile | Business profile | PUT body `businessProfileBody`. 422 field errors for GSTIN. Code `GST_CLEAR_CONFIRM_REQUIRED` when clearing a live GSTIN without `confirmGstClear` |
| GET /settings/number-series, PATCH /settings/number-series/:key | Number series | `numberSeriesDto`, body `numberSeriesUpdateBody` |
| GET, POST /users, PATCH /users/:id, POST /users/:id/reset-password | Users | list envelope `listResponse(userDto)` with `q`, `page`, `pageSize` |
| GET, POST /roles, PATCH /roles/:id, PUT /roles/:id/permissions, GET /roles/permission-catalog | Roles | `roleDto`, `permissionCatalog` |
| GET /activity | Activity log | `listResponse(activityDto)` with `entity`, `userId` filters |

## Questions for the backend

1. Which permission keys gate Number series and Activity log? F0 uses `settings.view` and `settings.edit`.
2. Should `GET /me` include the list of stores for the store switcher? F0 shows one fixed store.
3. Is `entity` on the activity log a free string? The filter list in the UI is fixed to user, role, business-profile, number-series.
