# EFMS Frontend

This repository contains the frontend of the Experimental Farming Management System (EFMS). It is the interface that farmers and researchers use to view and manage experimental farms, draw and edit parcels on a map, log daily operations and access the other features of the system.

The frontend communicates with the [EFMS backend](https://github.com/W-EFMS/EFMS-backend) through its REST API.

## Just want to run EFMS?

If you only want to deploy EFMS (the database, the backend and the website running together) you do not need this repository. The deployment repository provides a straightforward installation:

**[EFMS-deploy repository](https://github.com/W-EFMS/EFMS-deploy)**

## Technology stack

- **React 19 and React Router 7:** the application runs in framework mode with server-side rendering (SSR), so pages are rendered on the server and sent to the browser before hydration. It is not a traditional static single-page application.
- **Vite 6:** build tooling and hot reloading.
- **Tailwind CSS 4:** styling.
- **Leaflet and polygon clipping:** `react-leaflet` and `leaflet-draw` provide the interactive map, and `martinez-polygon-clipping` handles polygon overlaps.
- **i18next:** internationalisation. The language is tied to the URL (`/:locale/...`), so every page is locale-aware.
- **pnpm:** package manager.

### Project structure

The application code lives in the `app/` directory:

- `routes/`: the pages, mapped through `app/routes.ts`.
- `components/`: the reusable UI components; the mapping logic is in `components/map/`.
- `contexts/`: the React contexts for authentication and active farm selection.
- `hooks/` and `utils/`: shared logic and helper functions.

## Running locally

You need Node 22 and pnpm. Running `corepack enable` provides pnpm without a separate installation.

```sh
# 1. Install dependencies
pnpm install

# 2. Start the development server
pnpm dev
```

The application starts at `http://localhost:5173` with hot reloading enabled.

### Connecting to the backend

The frontend needs to know where the backend API is. By default it reads the `.env` file:

```env
API_URL=http://localhost:8080
```

For local development, run the backend on port `8080` (see the backend README) and run `pnpm dev` here.

### How the backend URL is resolved

In `app/config.ts`, the application looks for the backend URL in this order:

1. `window.__ENV__.API_URL`, injected at runtime so that Docker containers can be configured without a rebuild.
2. `process.env.API_URL`, injected at build time.
3. A fallback on `http://localhost:8080`.

## Building for production

```sh
pnpm build     # Compiles the application into the build/ directory
pnpm start     # Serves the SSR build with react-router-serve on port 3000
```

### Docker image

A `Dockerfile` installs the dependencies, builds the application and produces an optimised production image:

```sh
docker build -t efms-frontend:latest .
```

The included `docker-compose.yml` can be used for a standalone check. For production deployments, use the [deploy repository](https://github.com/W-EFMS/EFMS-deploy) to run the frontend, backend and database together.

## License

See the [LICENSE](LICENSE) file for details.
