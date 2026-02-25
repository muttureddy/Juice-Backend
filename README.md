Working backend code for version 1 on the date 17th Feb 2026

Frontend - 
Backend -

Backend (5 fixes)
#FixImpact1Auth middleware cache — 5-min in-memory Map, skip DB on repeat requests~60% fewer DB hits2DB indexes enabled — 8 product indexes + compound + text search + auditLogs TTL (90d)Product queries go from full scan → index scan3OTP rate limiting — 5 sends / 3 resends per 10 min per IP, zero new packagesProtects Twilio budget4Twilio typo fixed — TWILIO_ACCOUNT_SI → TWILIO_ACCOUNT_SIDSMS OTPs now actually work in prod5Stock decrement on order — atomic bulkWrite, pre-check stock, auto-hide at 0Prevents overselling
Frontend (3 fixes)
#FixImpact6AppContext fresh API fetch — verifies user from /users/profile on mount, global 401 interceptorStale role/name impossible; expired tokens auto-logout7Removed dead AdminProducts.js (364-line MUI duplicate) + added <Route path="*"> 404 pageSmaller bundle, no blank page on bad URLs8Removed dead src/db/connection.js — was never imported, duplicate of db.jsCleaner codebase