# Command Table vX.Y.Z

<!-- The release workflow places Docker installation and update instructions before these changes. Keep Docker/Compose and latest first; direct Node setup belongs in contributor documentation. Prereleases use their explicit version tag. -->

Changes:

Validation: unit/integration tests, Chromium and WebKit browser tests, native amd64 and arm64 container create/join/update/restart/backup checks.

Device testing: name the physical iPhone/Android devices and browser versions, or explicitly say unverified.

Upgrade: back up the SQLite volume and export important browser games; pull the published `latest` image and recreate the container with `docker compose -p mtg-util -f compose.yaml pull` followed by `docker compose -p mtg-util -f compose.yaml up -d`. Keep the same project, volume, `.env` and public origin. A fixed version or digest is optional; `latest` does not restart containers automatically.

Publication: confirm the selected source license, image owner/name, package visibility and unauthenticated pull before announcing public availability.
