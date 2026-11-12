# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: store.spec.ts >> listing >> Load more adds products and the back button keeps them
- Location: e2e\store.spec.ts:117:3

# Error details

```
AggregateError: apiRequestContext.post: connect ECONNREFUSED ::1:3100
connect ECONNREFUSED 127.0.0.1:3100
Call log:
  - → POST http://localhost:3100/api/v1/mock/reset
    - user-agent: Playwright/1.65.0 (x64; windows 10.0) node/24.18
    - accept: */*
    - accept-encoding: gzip,deflate,br

```