# MPloyChek Staff Portal

A role-based internal operations portal built with Angular 17 standalone components on the frontend and Express + TypeScript + MongoDB on the backend.

## Demo

https://github.com/Tanish-S-K/Mploychek_spa/demo.mp4

---

## 1. Setup

### Prerequisites
- Node.js (v20.x or v22.x recommended)
- MongoDB instance (Local or MongoDB Atlas connection string)

### Environment Configuration
Create a `.env` file inside the `backend` directory matching the following configuration:
```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/mploychek
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:4200
FRONTEND_URLS=http://localhost:4200,http://127.0.0.1:4200
GEMINI_API_KEY=your-gemini-api-key-here
```

### Installation & Launch

1. **Install Backend Dependencies**:
   ```bash
   cd backend
   npm install
   ```
2. **Launch Backend API (Development Mode)**:
   ```bash
   npm run dev
   ```
3. **Install Frontend Dependencies**:
   ```bash
   cd ../frontend
   npm install
   ```
4. **Launch Frontend Dev Server**:
   ```bash
   npm start
   ```

The frontend app will run on `http://localhost:4200` and automatically proxy requests to the backend API at `http://localhost:4000`.

---

## 2. Seeded Credentials
The database seeds itself automatically on start:
*   **Admin User**:
    *   Email: `admin@mploycheck.com`
    *   Password: `Admin@123`
*   **Employee One**:
    *   Email: `user1@mploycheck.com`
    *   Password: `User@123`
*   **Employee Two**:
    *   Email: `user2@mploycheck.com`
    *   Password: `User@123`

---

## 3. Architecture & API Endpoints

### API Endpoints
*   `POST /api/auth/login` - Authenticate user, set cookie and return session.
*   `POST /api/auth/logout` - Clear cookies and terminate session.
*   `GET /api/auth/me` - Retrieve current session details.
*   `GET /api/records` - Get staff records (admins see all, employees see their own).
*   `PATCH /api/records/:id` - Update status (Admin only).
*   `GET /api/users` - List all registered users (Admin only).
*   `POST /api/users` - Create a user profile (Admin only).
*   `PUT /api/users/:id` - Modify user details (Admin only).
*   `DELETE /api/users/:id` - Deactivate a user profile (Admin only).
*   `POST /api/assistant/chat` - Interact with the GenAI assistant / offline fallback query engine.
*   `GET /api/events` - SSE endpoint for client synchronization.

### Key Design Choices
- **Angular standalone components** are used to simplify file structure and route configurations.
- **Angular Signals** manage reactive state synchronously in the UI, while RxJS manages asynchronous network streams (e.g. `debounceTime` on searches, concurrent requests orchestration).
- **JWT token state** is managed safely inside `HttpOnly` cookie wrappers, preventing XSS leaks.
- **SSE (Server-Sent Events)** broadcasts mutations to all connected browsers so dashboards stay updated in real time.
