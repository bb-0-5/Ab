# Deploy BeyondBound to abovebound.org

BeyondBound is not a static-only site. Its Express API, `/ws` WebSocket endpoint,
background optimizer, and persistent discovery state need an always-on Node server.
The production layout is:

```text
Browser -> https://abovebound.org -> Cloudflare Tunnel -> AWS Docker host -> BeyondBound
```

Cloudflare terminates HTTPS and proxies WebSockets. The AWS security group does not
need public HTTP or HTTPS ports because `cloudflared` makes an outbound connection.

## 1. Create the AWS host

Use one Amazon Linux 2023 EC2 instance in `ap-southeast-2` to start. A `t3.small`
is enough for the current JavaScript optimizer; use `t3.medium` if builds run out
of memory or several users will be active at once.

Attach at least 16 GB of encrypted EBS storage. Allow outbound internet access.
For administration, prefer AWS Systems Manager Session Manager. If SSH is used,
restrict port 22 to your current IP; do not open ports 80, 443, or 3000.

Install Docker using the Amazon Linux 2023 packages:

```bash
sudo yum update -y
sudo yum install -y docker git
sudo service docker start
sudo usermod -a -G docker ec2-user
sudo systemctl enable docker
```

Log out and back in so the Docker group change applies. Install the Docker Compose
plugin if `docker compose version` is not available on the image.

## 2. Upload the repository

Put this repository at `/opt/beyondbound`. A private Git repository is easiest, but
SCP, SFTP, or an archive uploaded through S3 also works. Do not upload `node_modules`,
`dist`, `.env`, or `discovery_memory.json`; the container rebuilds or persists them.

```bash
sudo mkdir -p /opt/beyondbound
sudo chown ec2-user:ec2-user /opt/beyondbound
cd /opt/beyondbound
```

After the files are present:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in the real values. `TUNNEL_TOKEN` is required. BeyondBound's optimizer and
neural simulations run locally and do not call an external AI API. Supabase remains
optional for login and cloud history; leave its two values blank for local-only mode.

## 3. Create the Cloudflare Tunnel

In the Cloudflare dashboard:

1. Go to **Networking -> Tunnels** and create a remotely managed tunnel named
   `abovebound-production`.
2. Copy its token into `TUNNEL_TOKEN` in `.env.production` on AWS.
3. Add a **Published application** route for `abovebound.org`.
4. Set the service type to HTTP and the service URL to `http://app:3000`.
5. Add a second route for `www.abovebound.org` to the same service if the `www`
   hostname should work too.

The deployed tunnel currently uses `http://beyondbound:3000`. The Compose
`app` service includes `beyondbound` as a Docker-network alias, so either
`http://app:3000` or `http://beyondbound:3000` resolves to the same app.
Do not change the live tunnel configuration without checking its active host.


The hostname route creates the required Cloudflare DNS record. Keep Cloudflare's
Network -> WebSockets setting enabled.

## 4. Build and start

Run from `/opt/beyondbound`:

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app cloudflared
```

Check the local origin on AWS:

```bash
curl --fail http://127.0.0.1:3000/api/health
```

Then check the public route:

```bash
curl --fail https://abovebound.org/api/health
```

Open `https://abovebound.org`, start a simulation, and confirm the browser Network
panel shows a successful `wss://abovebound.org/ws` connection.

## 5. Updates and backups

After uploading or pulling new code:

```bash
docker compose --env-file .env.production up -d --build
docker image prune -f
```

The named Docker volume `beyondbound-data` holds `discovery_memory.json`. Back it up
before major upgrades:

```bash
docker run --rm -v beyondbound-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/beyondbound-data-backup.tgz -C /data .
```

Do not run more than one app replica against this file-based store. Before scaling
horizontally, move shared simulation state to Supabase/Postgres or another shared
database and use a shared pub/sub layer for WebSocket broadcasts.

## Optional offline EPW station climate

Whole System can use operator-supplied hourly temperatures when the station
coordinates are within 75 km of the selected site. The site/weather pairing is
validated every run and rejected if timestamps are missing, duplicated or
unordered, or if dry-bulb readings are missing/invalid.

1. Obtain a legally usable EnergyPlus Weather (`.epw`) file for the location.
   Check station provenance, actual weather years and how representative it is.
2. Place it in the persistent `beyondbound-data` Docker volume at
   `/app/data/weather/site.epw`. Do not commit the file or secret paths.
3. Add `ABOVEBOUND_EPW_FILE=weather/site.epw` to `.env.production`.
4. Rebuild/restart with `docker compose --env-file .env.production up -d --build`.
5. Open Whole System and verify the climate badge and exported report say
   `epw_hourly_temperature`; inspect the station distance and comparison.
   When it says `preset_fitted_degree_days`, do not imply EPW was used.

With no configured EPW, the app works exactly as before using the preset
degree-day profile. A station within 75 km may still differ significantly in
elevation, land cover and microclimate. This does NOT turn the separate
Site + Shadow model into an hourly model or validate energy performance.

## 6. AWS research compute

The current optimizer is a lightweight genetic search written in TypeScript. It
does not train a neural network and will not benefit from a permanently running GPU.
Keep the web app on CPU.

When there is a concrete training dataset and objective, split research into queued,
containerized jobs. Store datasets, checkpoints, and model artifacts in S3, then use
SageMaker Training or AWS Batch for on-demand CPU/GPU jobs. Spot training plus
checkpointing can reduce cost. Feed only validated model outputs back into the web
application; do not run expensive training in the request/WebSocket process.
