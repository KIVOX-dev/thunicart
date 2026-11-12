# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: store.spec.ts >> product page >> the phone view has a swipe gallery and a sticky Add to cart bar; the desktop has thumbnails and zoom
- Location: e2e\store.spec.ts:182:3

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