# Security Camera Backend

Node.js/Express backend for resident recognition, visitor tracking, emergency alert simulation, and Swagger-documented APIs.

## Run

```bash
npm install
# create .env from .env.example
npm run dev
```

Swagger UI is served at `http://localhost:5000/api/docs`.

## Matching Configuration

- `FACE_MATCH_THRESHOLD` defaults to `0.48`
- `FACE_MATCH_MARGIN` defaults to `0.05`
- `FACE_MATCH_THRESHOLD_BUFFER` defaults to `0.02`

Resident, visitor, and log data are now scoped to the authenticated user. The operational routes under `/api/residents`, `/api/emergency-contacts`, `/api/identify`, and `/api/logs` require a bearer token.

## Implemented API Surface

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/residents`
- `POST /api/residents`
- `GET /api/emergency-contacts/:residentId`
- `PUT /api/emergency-contacts/:residentId`
- `POST /api/emergency-contacts/:residentId/add`
- `DELETE /api/emergency-contacts/:residentId/:phoneNumber`
- `POST /api/identify`
- `GET /api/logs`

## Identification Behavior

- Known residents are matched against stored resident descriptors.
- Unknown faces seen together with a resident are promoted into 24-hour visitors and the event is logged as `Entry`.
- Unknown faces without resident context trigger an `Alert`, simulate emergency calling, and create an alert log.
- Known visitors and residents without unknown faces also create `Entry` logs.

## Frontend Spec

An updated frontend prompt that matches the backend implementation is available at [docs/FRONTEND_PROMPT.md](docs/FRONTEND_PROMPT.md).
