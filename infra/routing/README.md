# eloo routing + search server

The public OSRM and Photon demo servers are only for development. Before launch, eloo needs its own:

- **OSRM**: car routing on the Iraq OpenStreetMap extract (with up to 3 alternative routes).
- **Photon**: place search as you type, with Arabic and Kurdish names from OpenStreetMap.
- **Caddy**: HTTPS in front of both.

## Steps
1. Rent a VPS: Ubuntu, 4 vCPU, 8 GB RAM, 80 GB disk (about $20–40/month).
2. Point two DNS names at its IP, e.g. `routing.eloo.app` and `search.eloo.app`.
3. On the server:
   ```bash
   git clone https://github.com/omarwissamcpu/eloo && cd eloo/infra/routing
   ROUTING_HOST=routing.eloo.app SEARCH_HOST=search.eloo.app ./setup.sh
   ```
4. In the backend's environment (Render dashboard), set
   `OSRM_URL=https://routing.eloo.app` and `PHOTON_URL=https://search.eloo.app`.

## Checks
- `curl "https://routing.eloo.app/route/v1/driving/44.3661,33.3152;44.4211,33.3128?alternatives=3"` returns `"code":"Ok"`.
- `curl "https://search.eloo.app/api/?q=المتنبي&limit=3"` returns Baghdad results.

## Updating the map
Re-run `setup.sh` to pull the newest Iraq extract. Fixes made on openstreetmap.org (street names, one-ways, new roads) show up in eloo after the next update.
