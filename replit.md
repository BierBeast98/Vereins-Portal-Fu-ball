# TSV Bestellportal

A group ordering portal for sports club merchandise and training apparel, plus a comprehensive football department planning module. Built to replace Google Forms with a flexible admin-managed system.

## Overview

This application allows sports clubs to manage collective orders for team clothing AND plan their football season with an integrated calendar system.

### Key Features

**Bestellportal (Order Portal)**
- **Admin Dashboard**: Manage products, campaigns, and view orders
- **Product Management**: Create products with sizes, prices, and optional personalization (initials/flock printing)
- **Campaign Management**: Seasonal ordering campaigns with start/end dates
- **Public Order Form**: Members can place orders for active campaigns
- **Excel Export**: Export orders in CSV format for the sports retailer
- **Email Confirmation**: Order confirmations via Resend (requires valid API key)

**Fußball-Planung (Football Planning)**
- **Jahreskalender**: 12-month calendar view with color-coded events
- **Platzbelegung**: Weekly field occupancy view for A-Platz and B-Platz
- **BFV-Import**: Import match schedules from BFV.de for TSV Greding teams
- **Event Management**: Create training sessions, tournaments, club events, field closures
- **Conflict Detection**: Automatic detection of time overlaps on fields
- **Filter & Export**: Filter by team/type and export to CSV

## Project Structure

```
├── client/                 # Frontend React application
│   └── src/
│       ├── components/     # Reusable UI components
│       │   ├── ui/         # Shadcn UI components
│       │   ├── app-sidebar.tsx
│       │   └── theme-toggle.tsx
│       ├── pages/          # Page components
│       │   ├── admin/      # Admin pages
│       │   │   ├── products.tsx
│       │   │   ├── campaigns.tsx
│       │   │   ├── orders.tsx
│       │   │   ├── calendar.tsx    # Jahreskalender
│       │   │   ├── fields.tsx      # Platzbelegung
│       │   │   ├── bfv-import.tsx  # BFV-Import
│       │   │   └── settings.tsx
│       │   ├── home.tsx    # Public landing page
│       │   └── order-form.tsx
│       ├── lib/            # Utilities
│       └── hooks/          # Custom hooks
├── server/                 # Express backend
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # In-memory data storage
│   └── email.ts            # Resend email integration
└── shared/                 # Shared types and schemas
    └── schema.ts           # Data models and Zod validation
```

## Data Models

### Product
- name, category, basePrice, imageUrl
- availableSizes (array of sizes)
- initialsEnabled, initialsPrice, initialsLabel
- brand, season, shortDescription, longDescription
- active (boolean)

### Campaign
- name, description
- startDate, endDate
- productIds (selected products)
- active (boolean)

### Order
- customer info (email, firstName, lastName)
- campaignId
- items (array of OrderItem with product, size, quantity, initials)
- totalAmount, createdAt

### CalendarEvent
- title, type (spiel, training, turnier, vereinsevent, platzsperrung, sonstiges)
- team (herren, herren2, a-jugend through g-jugend, damen, alte-herren)
- field (a-platz, b-platz)
- date, startTime, endTime
- isHomeGame, opponent, location, competition
- bfvImported, bfvMatchId
- recurringGroupId (links recurring events together)

### BfvImportConfig
- team, bfvTeamUrl, season
- lastImport, active

## API Endpoints

### Products
- GET /api/products - List all products
- GET /api/products/:id - Get single product
- POST /api/products - Create product
- PATCH /api/products/:id - Update product
- DELETE /api/products/:id - Delete product

### Campaigns
- GET /api/campaigns - List all campaigns
- GET /api/campaigns/active - List active campaigns
- GET /api/campaigns/:id - Get single campaign
- POST /api/campaigns - Create campaign
- PATCH /api/campaigns/:id - Update campaign
- DELETE /api/campaigns/:id - Delete campaign

### Orders
- GET /api/orders - List all orders
- GET /api/orders/campaign/:campaignId - Orders by campaign
- POST /api/orders - Create order
- GET /api/orders/export/:campaignId - Export to CSV

### Calendar Events
- GET /api/calendar/events - List events (with optional filters)
- GET /api/calendar/events/:id - Get single event
- POST /api/calendar/events - Create event
- PATCH /api/calendar/events/:id - Update event
- DELETE /api/calendar/events/:id - Delete event
- GET /api/calendar/events/recurring/:groupId - Get all events in recurring group
- PATCH /api/calendar/events/recurring/:groupId - Update all events in recurring group
- DELETE /api/calendar/events/recurring/:groupId - Delete all events in recurring group
- GET /api/calendar/conflicts - Check for time conflicts
- GET /api/calendar/export - Export calendar to CSV

### BFV Import
- GET /api/calendar/bfv-configs - List BFV import configs
- POST /api/calendar/bfv-configs - Create config
- DELETE /api/calendar/bfv-configs/:id - Delete config
- POST /api/calendar/bfv-import/:configId - Import matches from BFV

## Routes

**Public**
- `/` - Public landing page with active campaigns
- `/order/:campaignId` - Order form for a specific campaign

**Admin - Bestellportal**
- `/admin/products` - Product management
- `/admin/campaigns` - Campaign management
- `/admin/orders` - Order overview with export

**Admin - Fußball-Planung**
- `/admin/calendar` - Jahreskalender (yearly calendar view)
- `/admin/fields` - Platzbelegung (field occupancy view)
- `/admin/bfv-import` - BFV data import for TSV Greding

**Admin - System**
- `/admin/settings` - Settings and password management

## Design System

- Primary color: Green (TSV branding - hsl(142, 70%, 35%))
- Uses Shadcn UI components
- Responsive design for desktop and mobile
- Dark mode support

## Event Types & Colors

- **Spiel** (Game): Blue - bg-blue-500
- **Training**: Green - bg-green-500
- **Turnier** (Tournament): Purple - bg-purple-500
- **Vereinsevent** (Club Event): Orange - bg-orange-500
- **Platzsperrung** (Field Closure): Red - bg-red-500
- **Sonstiges** (Other): Gray - bg-gray-500

## Teams (Mannschaften)

- Herren, Herren II
- A-Jugend through G-Jugend
- Damen
- Alte Herren

## Fields (Plätze)

- A-Platz (Hauptplatz) - Main pitch
- B-Platz (Nebenplatz) - Training pitch

## User Preferences

- Language: German (all UI text in German)
- Currency: Euro (€)
- Date format: DD.MM.YYYY
- Time format: HH:MM

## BFV Integration

The BFV-Import feature allows importing match schedules from the Bavarian Football Association (BFV) website. Configured team URLs for TSV Greding:
- Herren: https://www.bfv.de/mannschaften/tsv-greding/...
- Herren II: https://www.bfv.de/mannschaften/tsv-greding-ii/...

Home games are automatically assigned to A-Platz.
