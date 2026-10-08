# IntelliStay Live Environment Credentials

**Base URL**: `https://ritumbhara.intellistay.in`
**Login Endpoint**: `POST /api/Login/Login`

### Credentials
- **Username**: `Shivam`
- **Password**: `1234`

### Authentication Payload
```json
{
  "userIdentifier": "Shivam",
  "password": "1234",
  "channelId": 1
}
```

### Fetching Bookings Payload Example (GetAllBookingsByPagination)
Endpoint: `POST /api/Booking/GetAllBookingsByPagination`

```json
{
  "pagination": {
    "page": 0,
    "limit": 0
  },
  "filter": {
    "bookingIds": [
      0
    ],
    "customerId": 0,
    "onlyCheckedIn": true,
    "agentId": 0,
    "bookingStatusId": [
      0
    ],
    "arrivalDate": "2026-10-06T10:49:21.000Z",
    "departureDate": "2026-10-06T10:49:21.000Z",
    "branchId": 0,
    "source": "string",
    "occupiedDate": "2026-10-06T10:49:21.000Z",
    "orderBy": "string",
    "order": "string",
    "status": true,
    "getAll": true,
    "search": "string"
  }
}
```
