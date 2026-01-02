# League Analyzer

## Overview

A full-stack web application for visualizing dynasty fantasy football draft picks using the Sleeper API. Users can enter a Sleeper League ID to fetch and display future draft picks in a grid/table format, view traded picks with ownership tracking, manually override pick slots, and analyze team positional needs based on roster composition.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and data fetching
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Animations**: Framer Motion for smooth transitions and micro-interactions

The frontend follows a page-based structure with reusable components:
- `Home` page: League ID input and sync trigger
- `Dashboard` page: Draft pick grid visualization and team needs display
- Custom components for `PickCard` and `TeamNeedsCard` with inline editing capabilities

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod validation
- **Database ORM**: Drizzle ORM for type-safe database queries
- **Build Process**: Custom build script using esbuild for production bundling

Key API endpoints:
- `POST /api/league/:id/fetch` - Fetches data from Sleeper API and stores in database
- `GET /api/league/:id` - Retrieves stored league data for visualization
- `PATCH /api/picks/:id` - Updates individual pick slot overrides

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Tables**:
  - `leagues` - League metadata (name, settings, roster count)
  - `rosters` - Team roster information linked to owners
  - `users` - Sleeper user details (display names, avatars)
  - `draft_picks` - Resolved draft picks with ownership tracking and manual overrides

### Shared Code
- Schema definitions and Zod validators in `shared/schema.ts`
- API route definitions in `shared/routes.ts`
- TypeScript path aliases configured for `@/` (client), `@shared/` (shared code)

### Development vs Production
- Development: Vite dev server with HMR, tsx for TypeScript execution
- Production: Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`

## External Dependencies

### Third-Party APIs
- **Sleeper API**: Fantasy football platform API for fetching league data, rosters, users, and traded draft picks
  - League data: `https://api.sleeper.app/v1/league/{id}`
  - Rosters: `https://api.sleeper.app/v1/league/{id}/rosters`
  - Users: `https://api.sleeper.app/v1/league/{id}/users`
  - Traded picks: `https://api.sleeper.app/v1/league/{id}/traded_picks`
  - Avatar CDN: `https://sleepercdn.com/avatars/thumbs/{avatar_id}`

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **connect-pg-simple**: PostgreSQL session store (available but not currently implemented)

### Key NPM Packages
- `drizzle-orm` + `drizzle-kit`: Database ORM and migration tooling
- `@tanstack/react-query`: Async state management
- `framer-motion`: Animation library
- `zod`: Runtime type validation
- Radix UI primitives: Accessible component foundations
- `wouter`: Lightweight React router