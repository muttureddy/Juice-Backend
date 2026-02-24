# 🥤 Freshly — Backend v2 (Node.js + Express + MongoDB)

## What's Fixed in v2
- ✅ Twilio lazy-initialized (no crash if creds missing)
- ✅ `findOneAndUpdate` bug fixed — user always fetched fresh after upsert
- ✅ Full audit logging to `logs` collection
- ✅ CORS fixed — accepts multipart form data properly
- ✅ Status history array on every order
- ✅ Admin role management endpoint
- ✅ Logs viewer endpoint `/api/admin/logs`
- ✅ ObjectId validation before every DB query
- ✅ Cloudinary lazy-configured (server boots without creds)
- ✅ Proper error messages on every route

---

## Quick Start

```bash
# 1. Install
cd freshly-server
npm install

# 2. Set up env
cp .env.example .env
# Edit .env with your credentials

# 3. Run
npm run dev       # development (auto-restart)
npm start         # production
```

Server: `http://localhost:5000`
Health: `http://localhost:5000/api/health`

---

## Dev Mode (No External Services)
If Twilio / Cloudinary are not configured:
- **OTPs** print to your terminal console instead of SMS
- **Images** use in-memory storage (not persisted — configure Cloudinary for real uploads)

---

## API Reference

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/send-otp` | No | Send OTP (SMS or console in dev) |
| POST | `/api/auth/verify-otp` | No | Verify OTP → returns JWT + user |
| GET | `/api/auth/profile` | User | Get my profile |
| PUT | `/api/auth/profile` | User | Update name, email, address |

### Products (Public)
| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List active products (`?category=citrus&type=juices&search=mango`) |
| GET | `/api/products/:id` | Single product |

### Orders (Logged-in users)
| Method | Path | Description |
|---|---|---|
| POST | `/api/orders` | Place new order |
| GET | `/api/orders/my` | My order history |
| GET | `/api/orders/:id` | Single order |

### Admin (Admin role only)
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard totals |
| GET | `/api/admin/orders` | All orders (filterable) |
| PUT | `/api/admin/orders/:id/status` | Update order status + logs |
| GET | `/api/admin/payments` | Revenue analytics |
| GET | `/api/admin/products` | All products |
| POST | `/api/admin/products` | Add product (image upload) |
| PUT | `/api/admin/products/:id` | Update product |
| DELETE | `/api/admin/products/:id` | Delete + remove from Cloudinary |
| PATCH | `/api/admin/products/:id/toggle` | Show/hide |
| GET | `/api/admin/users` | All users |
| PATCH | `/api/admin/users/:id/role` | Change user role |
| GET | `/api/admin/logs` | Audit log viewer |

---

## Audit Logs

Every important action is recorded in the `logs` MongoDB collection:

| Action | When |
|---|---|
| `USER_LOGIN` | Successful login |
| `USER_SIGNUP` | First-time login |
| `USER_PROFILE_UPDATED` | Profile fields changed |
| `USER_ROLE_CHANGED` | Admin changes someone's role |
| `OTP_SENT` | OTP generated |
| `OTP_VERIFIED` | Successful OTP verification |
| `OTP_FAILED` | Wrong/expired OTP attempt |
| `ORDER_CREATED` | Customer places order |
| `ORDER_STATUS_CHANGED` | Admin updates order status (logs from→to) |
| `PRODUCT_CREATED` | Admin adds product |
| `PRODUCT_UPDATED` | Admin edits product |
| `PRODUCT_DELETED` | Admin deletes product |
| `PRODUCT_TOGGLED` | Admin shows/hides product |
| `ADMIN_VIEWED_ORDERS` | Admin opens orders page |
| `ADMIN_VIEWED_PAYMENTS` | Admin opens payments page |

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | User accounts, addresses, roles |
| `otps` | Temporary OTPs (auto-deleted after 10 min via TTL index) |
| `products` | Menu items with Cloudinary image URLs |
| `orders` | Customer orders with full status history array |
| `logs` | Complete audit trail of all actions |
