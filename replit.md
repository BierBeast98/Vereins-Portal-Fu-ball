# TSV Bestellportal

A group ordering portal for sports club merchandise and training apparel. Built to replace Google Forms with a flexible admin-managed system.

## Overview

This application allows sports clubs to manage collective orders for team clothing. The admin can create products, campaigns, and export orders to Excel for the sports retailer.

### Key Features

- **Admin Dashboard**: Manage products, campaigns, and view orders
- **Product Management**: Create products with sizes, prices, and optional personalization (initials/flock printing)
- **Campaign Management**: Seasonal ordering campaigns with start/end dates
- **Public Order Form**: Members can place orders for active campaigns
- **Excel Export**: Export orders in CSV format for the sports retailer

## Project Structure

```
├── client/                 # Frontend React application
│   └── src/
│       ├── components/     # Reusable UI components
│       │   ├── ui/         # Shadcn UI components
│       │   ├── app-sidebar.tsx
│       │   └── theme-toggle.tsx
│       ├── pages/          # Page components
│       │   ├── admin/      # Admin pages (products, campaigns, orders)
│       │   ├── home.tsx    # Public landing page
│       │   └── order-form.tsx # Order form for campaigns
│       ├── lib/            # Utilities
│       └── hooks/          # Custom hooks
├── server/                 # Express backend
│   ├── routes.ts           # API endpoints
│   └── storage.ts          # In-memory data storage
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

## Routes

- `/` - Public landing page with active campaigns
- `/order/:campaignId` - Order form for a specific campaign
- `/admin/products` - Product management
- `/admin/campaigns` - Campaign management
- `/admin/orders` - Order overview with export

## Design System

- Primary color: Green (TSV branding)
- Uses Shadcn UI components
- Responsive design for desktop and mobile
- Dark mode support

## User Preferences

- Language: German (all UI text in German)
- Currency: Euro (€)
- Date format: DD.MM.YYYY
