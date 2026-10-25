# Hotel Booking

A full-stack web app for booking hotel rooms. Guests search for free rooms, book them and pay.
Front desk staff check guests in and out. Admins manage room types, rooms and payments.

**Tech:** Python (Flask) · PostgreSQL · React · Ant Design

<!-- Add screenshots to docs/screenshots/ and they will show here -->
<!--
| Search rooms | Room detail | Admin: bookings |
|---|---|---|
| ![](docs/screenshots/search.png) | ![](docs/screenshots/room-detail.png) | ![](docs/screenshots/admin-bookings.png) |
-->
![](images/search-rooms.png)

![](images/register.png) 

![](images/login.png) 

![](images/choose-rooms.png) 

![](images/booking.png) 

![](images/payment.png) 

![](images/manage-room-types.png) 

![](images/manage-rooms.png) 

---

## Features

### For guests
- Search free rooms by check-in date, check-out date, number of guests and price per night.
- Sort results by price or room size.
- See room details, photos and the exact rooms that are free for the chosen dates.
- Choose specific rooms and create a booking.
- Pay by cash, bank transfer, card, MoMo or VNPay (the payment is confirmed by an admin).
- See "My bookings" and cancel a booking before the check-in day.
- Update profile, change password, or close the account.


### For admins
- See all bookings in a table. Filter by check-in date, by status, or search by booking code, name, email or phone.
- Open a booking to see the guest, the rooms and the payment status.
- Check guests in and out. Early check-out frees the remaining nights for new guests.
- Create, edit, hide and restore room types (name, price, size, description, up to 20 photos).
- Add rooms and put them into maintenance.
- Confirm, reject or refund payments.

---

## Tech stack

| Part | Tools |
|---|---|
| Backend | Python 3.10, Flask 3, SQLAlchemy 2, Flask-JWT-Extended, Flask-Limiter, argon2 |
| Database | PostgreSQL |
| Frontend | React 18, Vite, Ant Design 5, TanStack Query, React Router, axios, dayjs |

---

## Technical highlights

These are the problems I spent the most time on.

**1. No double booking.**
Two guests can click "Book" on the same room at the same moment. The backend locks the chosen
rooms in the database (`SELECT ... FOR UPDATE`, always in the same order to avoid deadlocks),
then checks for overlapping dates. The second request waits, then gets a clear "already booked" error.

**2. Rooms are held for 5 hours, then released.**
A new booking holds its rooms for 5 hours while the guest chooses how to pay.
- The rooms become free again right at the deadline, because every availability query ignores expired bookings.
- The API shows the status as "expired" right away, even before the database is updated.
- A small periodic job (`flask expire-bookings`) updates the status in the database. It works in batches and uses `SKIP LOCKED`, so it never makes real users wait.
- If the guest has already sent a payment (for example "cash at the hotel"), the booking does not expire.

**3. Security.**
- Login uses a JWT stored in an **HttpOnly cookie**, so JavaScript cannot read it. Every write request also needs a **CSRF token**.
- Passwords are hashed with **argon2**. New passwords must be strong.
- Login and register are **rate limited**.
- Image upload checks the file type and size (max 5 MB per image, 25 MB per request).
  Image delete only accepts files that belong to that room type, and it can never delete files outside the upload folder.
- The app refuses to start if `DATABASE_URL` or `JWT_SECRET_KEY` is missing or the secret is too short.

**4. One error format for the whole API.**
Every error looks the same, so the frontend can handle it in one place:
```json
{ "success": false, "error": "Room(s) already booked for these dates: 301", "code": "CONFLICT" }
```
Unexpected server errors return only an `error_id`

**5. Correct dates and times.**
Moments in time (`created_at`, payment deadline) are stored as `TIMESTAMPTZ`.
Check-in and check-out are plain dates on the hotel's calendar (Vietnam time), so "today" does not depend on the server's time zone.

**6. Fast list pages.**
Lists load related data (rooms, room types, guests) in a fixed number of queries with `selectinload`,
instead of one extra query per row (the "N+1" problem).

---

## Project structure

```
backend/
  app.py              Creates the Flask app, registers routes and the "expire-bookings" command
  config.py           Settings, checks required environment variables
  models.py           Database tables (SQLAlchemy)
  errors.py           One place that turns every error into the same JSON format
  routes/             API endpoints: auth, rooms, bookings, payments, admin
  utils/              Shared logic: booking rules, statuses, images, pagination, validation, time
  database/           SQL schema scripts
  static/uploads/     Uploaded room photos

frontend/src/
  api/                One file per API area; client.js holds the shared axios setup
  context/            Login state (AuthContext)
  components/         Shared UI: layout, room card, image manager, route guards
  pages/              Guest pages (search, room detail, booking, payment, profile)
  pages/admin/        Admin pages (bookings, room types, rooms)
  utils/              Formatting, statuses, error messages, form rules
```

---

## Getting started

You need **Python 3.10+**, **Node.js 18+** and **PostgreSQL**.

### 1. Database

Create a database, then create the tables:

```bash
createdb hotel_db
psql -d hotel_db -f backend/database/schemas.sql
```

### 2. Backend

Create `backend/.env`:

```
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/hotel_db
JWT_SECRET_KEY=<a random string, at least 32 characters>
```

You can make a secret with: `python -c "import secrets; print(secrets.token_hex(32))"`

Then install and run:

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The API runs at `http://localhost:5000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api` and `/static` to the backend, so no extra setup is needed.

### 4. Create an admin account

Register a normal account on the website, then change its role in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

### 5. Periodic job: expire unpaid bookings

This job only updates the status column in the database. The app works correctly without it,
but it should run about every 15 minutes:

```bash
cd backend
flask --app app expire-bookings
```

Linux (cron):

```
*/15 * * * * cd /path/to/backend && /path/to/python -m flask --app app expire-bookings
```

Windows (Task Scheduler):

```
schtasks /create /tn "HotelExpireBookings" /sc minute /mo 15 /tr "cmd /c cd /d \"C:\path\to\backend\" && python -m flask --app app expire-bookings"
```