# BTIS v1.0 — Bridgeport Traffic Intelligence System

## Included
- Supabase email/password login
- Roles: admin, transportation, school, executive
- RLS-secured schools, buses, routes, stops, incidents and GPS tables
- Live dashboard KPIs and alerts
- Mapbox interactive Bridgeport operations map
- Add-school, add-bus, add-route and add-incident forms
- Realtime bus and incident refresh
- Phase 1 dismissal-time what-if simulator
- Starter demonstration records

## Installation
1. Create a Supabase project.
2. Open **SQL Editor**, paste `schema.sql`, and run it.
3. In Supabase Authentication, create your user account.
4. Run this SQL, replacing the email:
   ```sql
   update public.profiles
   set role = 'admin'
   where lower(email) = lower('YOUR_EMAIL@bridgeportedu.net');
   ```
5. Create a public Mapbox access token.
6. Copy `config.example.js` to `config.js` and enter:
   - Supabase Project URL
   - Supabase anon/public key
   - Mapbox public token
7. Serve the folder from a web server. Do not double-click `index.html` directly.

### Simple local server
```bash
python -m http.server 8080
```
Then open `http://localhost:8080`.

## Deployment
The static files can be hosted on Netlify, Vercel, GitHub Pages, Cloudflare Pages, or your existing web server. Keep the Supabase service-role key out of all frontend files. Only the anon/public key belongs in `config.js`.

## Important
The five supplied school coordinates and all bus/incident data are demonstration records. Replace or expand them with district-authoritative records before production use.
