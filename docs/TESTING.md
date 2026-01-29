# Testing

## Backend

From `backend/`:

```
composer test
```

Tests use PostgreSQL via `phpunit.xml`. Create a `bakegrill_test` database and update credentials if needed.

## Frontend

From each app folder:

```
npm run build
npm run preview
```

To run frontend tests:

```
npm run test
```

## Manual smoke checks

- `GET /api/health`
- Staff PIN login, create order, take payment
- KDS bump order
- Receipt send + open token page + PDF
- Online order OTP flow
